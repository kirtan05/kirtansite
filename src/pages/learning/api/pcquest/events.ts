export const prerender = false;

/**
 * POST /learning/api/pcquest/events — the laptop's outbox (kid token).
 *
 * Body: { device_id, device, app_version, events: [{ id, at, kind, task, rev, step, detail }] }
 * At most 50 events; one bad event rejects the batch with a 400 (see
 * validateEvents). Timestamps outside -30d..+1d are clamped to now and marked
 * detail.clamped.
 *
 * Idempotent: each event's id is the app's UUID and rows go in with INSERT OR
 * IGNORE, so a re-sent outbox changes nothing. A heartbeat is not stored per
 * event: it moves the device's last_seen (as every request does) and keeps at
 * most one row per device per IST day, id hb|device|day — spec §10 retention.
 *
 * Statement budget: one device upsert, heartbeats (≤ 50), and the rest as
 * multi-row inserts of 11 (11 × 9 = 99 bound params, under the 100 limit),
 * all in one batch — under the ~50 statements a free-plan invocation allows
 * in the common case, and a batch of 50 heartbeats only ever happens if the
 * app misbehaves.
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../lib/learning/pcquest-auth';
import { heartbeatId, validateEvents, type CleanPqEvent } from '../../../../lib/learning/pcquest';

const ROWS_PER_INSERT = 11;

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'kid');
  if (env instanceof Response) return env;
  const db = env.PCQUEST_DB;

  const body = await readJson(ctx);
  if (body === null) return bad('bad json');
  const now = new Date();
  const nowIso = now.toISOString();
  const batch = validateEvents(body, now);
  if (typeof batch === 'string') return bad(batch);

  const { device_id, device, app_version, events } = batch;
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO pq_device (id, label, app_version, first_seen, last_seen) VALUES (?, COALESCE(?, 'laptop'), ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
           label = CASE WHEN ? IS NULL THEN pq_device.label ELSE excluded.label END,
           app_version = COALESCE(excluded.app_version, pq_device.app_version)`,
      )
      .bind(device_id, device, app_version, nowIso, nowIso, device),
  ];

  // Heartbeats: one row per device per IST day of the heartbeat's own `at`,
  // so days he was offline still show once the outbox drains.
  const rows: Array<CleanPqEvent> = [];
  const hbSeen = new Set<string>();
  for (const e of events) {
    if (e.kind !== 'heartbeat') rows.push(e);
    else {
      const id = heartbeatId(device_id, e.at);
      if (!hbSeen.has(id)) {
        hbSeen.add(id);
        rows.push({ ...e, id });
      }
    }
  }

  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const group = rows.slice(i, i + ROWS_PER_INSERT);
    const ph = group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const binds = group.flatMap((e) => [
      e.id,
      device_id,
      e.at,
      nowIso,
      e.kind,
      e.task,
      e.rev,
      e.step,
      e.detail ? JSON.stringify(e.detail) : null,
    ]);
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO pq_event (id, device_id, at, received_at, kind, task, rev, step, detail) VALUES ${ph}`,
        )
        .bind(...binds),
    );
  }

  let inserted = 0;
  try {
    const results = await db.batch(stmts);
    for (const r of results.slice(1)) inserted += r.meta?.changes ?? 0;
  } catch {
    return bad('store failed', 500);
  }

  return json({ ok: true, received: events.length, inserted });
};
