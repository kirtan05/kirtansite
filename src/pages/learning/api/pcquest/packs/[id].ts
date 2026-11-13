export const prerender = false;

/**
 * /learning/api/pcquest/packs/:id — `quest push` and `quest retire` (coach token).
 *
 * PUT  body { wire, assets: [{ path, b64 }] }
 *      `wire` is the signed pack as a JSON string: {"payload": "...", "sig": "..."}.
 *      Limits: wire ≤ 1.5 MB, ≤ 20 assets, each ≤ 1 MB decoded, paths unique.
 *      400 unless the signature verifies against PCQUEST_PACK_PUBKEY and the
 *      payload's `pack` equals :id; 503 if that key is missing or is still the
 *      placeholder. The wire is stored byte-for-byte; the server bumps
 *      `version` and un-retires the pack. The pack's old asset rows are
 *      deleted and the ones sent take their place, keyed by (pack, path).
 *      Errors from PUT are JSON: { ok: false, error }.
 * POST ?retire=1  hides the pack from sync. History is kept; nothing is deleted.
 *      (Also at POST /packs/:id/retire, the spec §10 spelling.)
 *
 * The coach token alone cannot push a pack: the signature needs the private
 * key on Kirtan's box, which is the point of signing (spec §0).
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../../lib/learning/pcquest-auth';
import { retirePack } from '../../../../../lib/learning/pcquest-db';
import { chunk, pubkeyUsable, validatePackPut, verifyPackSig } from '../../../../../lib/learning/pcquest';

const MAX_BATCH = 40; // statements per D1 batch, under the ~50 a free-plan invocation allows

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}

const validId = (id: string | undefined): id is string => !!id && /^[a-z0-9-]{1,64}$/.test(id);
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

export const PUT: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;
  const id = ctx.params.id;
  if (!validId(id)) return fail('bad pack id');
  const pub = env.PCQUEST_PACK_PUBKEY;
  if (!(await pubkeyUsable(pub))) return fail('PCQUEST_PACK_PUBKEY not configured here', 503);

  try {
    const body = await readJson(ctx);
    if (body === null) return fail('bad json');
    const put = validatePackPut(body);
    if (typeof put === 'string') return fail(put);
    if (!(await verifyPackSig(put.wire, pub!))) return fail('bad signature');

    let packId: unknown;
    try {
      packId = JSON.parse(JSON.parse(put.wire).payload)?.pack;
    } catch {
      return fail('payload is not JSON');
    }
    if (packId !== id) return fail('payload pack does not match :id');

    const assets = [];
    for (const a of put.assets) assets.push({ ...a, sha256: await sha256Hex(a.bytes) });

    const db = env.PCQUEST_DB;
    const now = new Date().toISOString();
    const stmts = [
      db.prepare('DELETE FROM pq_asset WHERE pack_id = ?').bind(id),
      ...assets.map((a) =>
        db
          .prepare('INSERT OR REPLACE INTO pq_asset (pack_id, path, sha256, bytes) VALUES (?, ?, ?, ?)')
          .bind(id, a.path, a.sha256, a.bytes),
      ),
      // Last, so a pack never points at assets that failed to land.
      db
        .prepare(
          `INSERT INTO pq_pack (id, wire, version, updated_at, retired) VALUES (?, ?, 1, ?, 0)
           ON CONFLICT(id) DO UPDATE SET wire = excluded.wire, version = pq_pack.version + 1,
             updated_at = excluded.updated_at, retired = 0
           RETURNING version`,
        )
        .bind(id, put.wire, now),
    ];
    let version: number | null = null;
    for (const group of chunk(stmts, MAX_BATCH)) {
      const results = await db.batch(group);
      const last = results.at(-1)?.results?.[0] as any;
      if (last?.version != null) version = last.version;
    }

    return json({ ok: true, pack: id, version, assets: assets.map((a) => ({ sha256: a.sha256, path: a.path })) });
  } catch {
    return fail('store failed', 500);
  }
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
