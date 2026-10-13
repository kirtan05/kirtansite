export const prerender = false;

/**
 * Receive activity from a laptop.
 *
 * This is the one /learning route NOT behind the coach cookie — a headless
 * uploader on a Windows laptop cannot carry one. It authenticates instead with
 * a bearer token (ACTIVITY_INGEST_TOKEN), compared in constant time.
 *
 * Blast radius of a leaked ingest token (the token sits on the laptop, so the
 * child nominally has it): it can WRITE junk events and tracker rows and
 * register devices — it can never read the record. Because the coach view
 * aggregates across devices rather than trusting a "current device" pointer, a
 * forged device cannot hide the real data; junk events would show as activity,
 * which is itself a visible signal. Rotate by setting a new secret.
 *
 * Writes are idempotent: each event's primary key is deterministic
 * (device|bucket|start), so the uploader deliberately re-sends the still-open
 * tail event each run — whose duration AW grows in place — and the upsert
 * updates the duration instead of duplicating the event.
 *
 * Statement budget: the free plan allows ~50 statements per invocation (see
 * docs/learning/data-model.md). Events go out as multi-row INSERTs of
 * ROWS_PER_INSERT, and MAX_EVENTS is capped so device + tracker + event
 * statements stay under that ceiling. The uploader chunks to match.
 */
import type { APIRoute } from 'astro';
import { hostAllowed } from '../../../../lib/learning/guard';
import { eventKey, istDay, validateEvent, type CleanEvent } from '../../../../lib/learning/activity';

const ROWS_PER_INSERT = 8; // 8 rows × 12 cols = 96 bound params, under the 100 limit
const MAX_EVENTS = 300; // 300/8 ≈ 38 statements + device + tracker, under ~50
const MAX_TRACKER = 40;

function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const POST: APIRoute = async (ctx) => {
  if (!hostAllowed(ctx)) return new Response('Not found', { status: 404 });

  const env = (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
  const db = env.ACTIVITY_DB;
  const token = env.ACTIVITY_INGEST_TOKEN;
  if (!db || !token) return new Response('activity monitor not configured here', { status: 503 });

  const auth = ctx.request.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || !sameString(presented, token)) return new Response('no', { status: 401 });

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const deviceId = typeof body?.device_id === 'string' ? body.device_id : null;
  const label = typeof body?.device === 'string' ? body.device.slice(0, 64) : 'laptop';
  if (!deviceId || deviceId.length < 16 || deviceId.length > 128) {
    return new Response('missing device_id', { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const rawEvents: unknown[] = Array.isArray(body?.events) ? body.events : [];
  if (rawEvents.length > MAX_EVENTS) return new Response('too many events; chunk smaller', { status: 413 });

  const clean: CleanEvent[] = [];
  for (const r of rawEvents) {
    const c = validateEvent(r as any, now);
    if (c) clean.push(c);
  }

  // Tracker events: bounded time, known kinds, deterministic id so retries don't duplicate.
  const trackerRaw: any[] = Array.isArray(body?.tracker) ? body.tracker.slice(0, MAX_TRACKER) : [];
  const trackers: Array<{ id: string; kind: string; at: string; detail: string | null; day: string }> = [];
  for (const t of trackerRaw) {
    const kind = t?.kind;
    if (kind !== 'stopped' && kind !== 'started' && kind !== 'heartbeat') continue;
    const at = new Date(typeof t?.at === 'string' ? t.at : nowIso);
    if (Number.isNaN(at.getTime())) continue;
    if (at.getTime() > nowMs + 10 * 60_000 || at.getTime() < nowMs - 730 * 86_400_000) continue;
    const atIso = at.toISOString();
    const detail = t?.detail != null ? String(t.detail).slice(0, 200) : null;
    trackers.push({ id: eventKey(deviceId, 'trk-' + kind, atIso), kind, at: atIso, detail, day: istDay(at) });
  }

  try {
    // Device upsert / heartbeat — one statement, every request.
    await db
      .prepare(
        `INSERT INTO activity_device (id, label, created_at, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, label = excluded.label`,
      )
      .bind(deviceId, label, nowIso, nowIso)
      .run();

    // Tracker rows — one multi-row INSERT (count is small), idempotent.
    if (trackers.length) {
      const ph = trackers.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const binds = trackers.flatMap((t) => [t.id, deviceId, t.kind, t.at, t.detail, t.day]);
      await db
        .prepare(
          `INSERT INTO activity_tracker_event (id, device_id, kind, at, detail, day) VALUES ${ph}
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(...binds)
        .run();
    }

    // Events — multi-row INSERTs, idempotent upsert on the deterministic key.
    for (const group of chunk(clean, ROWS_PER_INSERT)) {
      const ph = group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const binds = group.flatMap((e) => [
        eventKey(deviceId, e.bucket, e.started_at),
        deviceId,
        e.bucket,
        e.started_at,
        e.duration_s,
        e.app,
        e.title,
        e.url,
        e.host,
        e.status,
        e.day,
        nowIso,
      ]);
      await db
        .prepare(
          `INSERT INTO activity_event
             (id, device_id, bucket, started_at, duration_s, app, title, url, host, status, day, created_at)
           VALUES ${ph}
           ON CONFLICT(id) DO UPDATE SET
             duration_s = excluded.duration_s, app = excluded.app, title = excluded.title,
             url = excluded.url, host = excluded.host, status = excluded.status`,
        )
        .bind(...binds)
        .run();
    }
  } catch (err) {
    return new Response('ingest failed', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, stored: clean.length, tracker: trackers.length }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
