export const prerender = false;

/**
 * /learning/api/pcquest/packs/:id — `quest push` and `quest retire` (coach token).
 *
 * PUT  body { wire, assets: [{ path, b64 }] }
 *      `wire` is the signed pack as a JSON string: {"payload": "...", "sig": "..."}.
 *      400 unless the signature verifies against PCQUEST_PACK_PUBKEY and the
 *      payload's `pack` equals :id. The wire is stored byte-for-byte; the
 *      server bumps `version` and un-retires the pack. The pack's assets are
 *      replaced by the ones sent (content-addressed by sha256).
 * POST ?retire=1  hides the pack from sync. History is kept; nothing is deleted.
 *      (Also at POST /packs/:id/retire, the spec §10 spelling.)
 *
 * The coach token alone cannot push a pack: the signature needs the private
 * key on Kirtan's box, which is the point of signing (spec §0).
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../../lib/learning/pcquest-auth';
import { retirePack } from '../../../../../lib/learning/pcquest-db';
import { verifyPackSig } from '../../../../../lib/learning/pcquest';

const MAX_ASSETS = 60;
const MAX_ASSET_BYTES = 1_500_000; // D1 caps a row at 2 MB

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const validId = (id: string | undefined): id is string => !!id && /^[a-z0-9-]{1,64}$/.test(id);

export const PUT: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;
  const id = ctx.params.id;
  if (!validId(id)) return bad('bad pack id');
  const pub = env.PCQUEST_PACK_PUBKEY;
  if (!pub) return bad('PCQUEST_PACK_PUBKEY not configured here', 503);

  const body = await readJson(ctx);
  const wire = body?.wire;
  if (typeof wire !== 'string') return bad('missing wire');
  if (!(await verifyPackSig(wire, pub))) return bad('bad signature');

  let packId: unknown;
  try {
    packId = JSON.parse(JSON.parse(wire).payload)?.pack;
  } catch {
    return bad('payload is not JSON');
  }
  if (packId !== id) return bad('payload pack does not match :id');

  const rawAssets: unknown[] = Array.isArray(body?.assets) ? body.assets : [];
  if (rawAssets.length > MAX_ASSETS) return bad('too many assets');
  const assets: Array<{ sha256: string; path: string; bytes: Uint8Array }> = [];
  for (const a of rawAssets as any[]) {
    if (typeof a?.path !== 'string' || !a.path || a.path.length > 200 || typeof a?.b64 !== 'string') {
      return bad('bad asset');
    }
    const bytes = b64ToBytes(a.b64);
    if (!bytes) return bad(`asset ${a.path}: bad base64`);
    if (bytes.length > MAX_ASSET_BYTES) return bad(`asset ${a.path}: too large`);
    assets.push({ sha256: await sha256Hex(bytes), path: a.path, bytes });
  }

  const db = env.PCQUEST_DB;
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare('DELETE FROM pq_asset WHERE pack_id = ?').bind(id),
    ...assets.map((a) =>
      db
        .prepare('INSERT OR REPLACE INTO pq_asset (sha256, pack_id, path, bytes) VALUES (?, ?, ?, ?)')
        .bind(a.sha256, id, a.path, a.bytes),
    ),
    db
      .prepare(
        `INSERT INTO pq_pack (id, wire, version, updated_at, retired) VALUES (?, ?, 1, ?, 0)
         ON CONFLICT(id) DO UPDATE SET wire = excluded.wire, version = pq_pack.version + 1,
           updated_at = excluded.updated_at, retired = 0
         RETURNING version`,
      )
      .bind(id, wire, now),
  ]);
  const version = (results.at(-1)?.results?.[0] as any)?.version ?? null;

  return json({ ok: true, pack: id, version, assets: assets.map((a) => ({ sha256: a.sha256, path: a.path })) });
};

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;
  const id = ctx.params.id;
  if (!validId(id)) return bad('bad pack id');
  if (ctx.url.searchParams.get('retire') !== '1') return bad('POST needs ?retire=1');

  if (!(await retirePack(env.PCQUEST_DB, id))) return bad('no such pack', 404);
  return json({ ok: true, pack: id, retired: true });
};
