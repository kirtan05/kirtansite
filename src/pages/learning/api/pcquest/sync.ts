export const prerender = false;

/**
 * GET /learning/api/pcquest/sync — the laptop's one read (kid token).
 *
 *   ?format=1&app=1.0.0&caps=…&device_id=…   → the sync document (JSON)
 *   ?asset=<sha256>                           → that asset's bytes
 *
 * The packs go out exactly as pushed; the laptop verifies each signature
 * itself against the key built into the app, so this route is not trusted to
 * vouch for them. `progress` is the fold of every event ever received, which
 * is what restores his record after a reinstall (spec §9).
 *
 * `device_id` is optional; when present the device's last_seen moves, which is
 * how a sync with nothing to send still counts as "seen".
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json } from '../../../../lib/learning/pcquest-auth';
import {
  latestRelease,
  loadApprovals,
  loadPacks,
  loadProgress,
  loadResets,
} from '../../../../lib/learning/pcquest-db';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export const GET: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'kid');
  if (env instanceof Response) return env;
  const db = env.PCQUEST_DB;
  const q = ctx.url.searchParams;

  const asset = q.get('asset');
  if (asset !== null) {
    if (!/^[0-9a-f]{64}$/.test(asset)) return bad('bad asset');
    const row = await db.prepare('SELECT path, bytes FROM pq_asset WHERE sha256 = ?').bind(asset).first<any>();
    if (!row) return bad('no such asset', 404);
    const ext = String(row.path).split('.').pop()?.toLowerCase() ?? '';
    return new Response(new Uint8Array(row.bytes), {
      headers: {
        'content-type': TYPES[ext] ?? 'application/octet-stream',
        'cache-control': 'private, max-age=31536000, immutable',
      },
    });
  }

  const deviceId = q.get('device_id');
  if (deviceId && deviceId.length >= 8 && deviceId.length <= 128) {
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO pq_device (id, label, app_version, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
           app_version = COALESCE(excluded.app_version, pq_device.app_version)`,
      )
      .bind(deviceId, (q.get('device') ?? 'laptop').slice(0, 64), q.get('app')?.slice(0, 32) ?? null, now, now)
      .run();
  }

  const [packs, assets, approvals, resets, progress, app] = await Promise.all([
    loadPacks(db, false),
    db
      .prepare(
        `SELECT a.sha256, a.pack_id AS pack, a.path FROM pq_asset a
           JOIN pq_pack p ON p.id = a.pack_id WHERE p.retired = 0 ORDER BY a.pack_id, a.path`,
      )
      .all(),
    loadApprovals(db),
    loadResets(db),
    loadProgress(db),
    latestRelease(db),
  ]);

  return json({
    packs: packs.map((p) => JSON.parse(p.wire)),
    assets: assets.results ?? [],
    approvals,
    resets,
    progress,
    app,
  });
};
