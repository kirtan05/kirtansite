export const prerender = false;

import type { APIRoute } from 'astro';
import { json, requireApi } from '../../../lib/gree/guard';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(['new', 'review', 'redo', 'question']);
const str = (v: unknown, max = 64) => (typeof v === 'string' && v.length <= max ? v : null);
const int = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/**
 * The one write path for studying. Every item carries its own id or its own
 * last_at, so the same payload can arrive twice (flaky office wifi, a phone
 * that slept mid-request) and nothing is counted twice.
 */
export const POST: APIRoute = async (ctx) => {
  const g = await requireApi(ctx);
  if (!g.ok) return g.response;
  const db = g.db;

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const device = str(body.device, 40);
  const stmts: D1PreparedStatement[] = [];

  for (const a of (Array.isArray(body.answers) ? body.answers : []).slice(0, 500)) {
    const id = str(a.id), at = str(a.at), day = str(a.day, 10), item = str(a.item, 40), mode = str(a.mode, 20);
    if (!id || !at || !day || !DAY.test(day) || !item || !KINDS.has(a.kind)) continue;
    stmts.push(
      db
        .prepare('INSERT OR IGNORE INTO answer (id, at, day, kind, item, mode, correct, ms, device) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(id, at, day, a.kind, item, mode, a.correct ? 1 : 0, int(a.ms, 0, 3_600_000), device),
    );
  }

  for (const c of (Array.isArray(body.cards) ? body.cards : []).slice(0, 1000)) {
    const [wid, box, due, r, w, first, last] = c ?? [];
    if (int(wid, 1, 100_000) === null || int(box, 0, 9) === null || !DAY.test(due ?? '') || !str(first) || !str(last)) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO card (word_id, box, due, right_n, wrong_n, first_at, last_at) VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(word_id) DO UPDATE SET box = excluded.box, due = excluded.due,
             right_n = excluded.right_n, wrong_n = excluded.wrong_n, last_at = excluded.last_at
           WHERE excluded.last_at > card.last_at`,
        )
        .bind(wid, box, due, int(r, 0, 1e6) ?? 0, int(w, 0, 1e6) ?? 0, first, last),
    );
  }

  for (const q of (Array.isArray(body.qstates) ? body.qstates : []).slice(0, 1000)) {
    const [qid, box, due, r, w, last] = q ?? [];
    if (!str(qid, 40) || int(box, 0, 9) === null || !DAY.test(due ?? '') || !str(last)) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO qstate (qid, box, due, right_n, wrong_n, last_at) VALUES (?,?,?,?,?,?)
           ON CONFLICT(qid) DO UPDATE SET box = excluded.box, due = excluded.due,
             right_n = excluded.right_n, wrong_n = excluded.wrong_n, last_at = excluded.last_at
           WHERE excluded.last_at > qstate.last_at`,
        )
        .bind(qid, box, due, int(r, 0, 1e6) ?? 0, int(w, 0, 1e6) ?? 0, last),
    );
  }

  for (const t of (Array.isArray(body.ticks) ? body.ticks : []).slice(0, 500)) {
    const id = str(t.id), day = str(t.day, 10), s = int(t.seconds, 1, 3600);
    if (!id || !day || !DAY.test(day) || s === null) continue;
    stmts.push(
      db.prepare('INSERT OR IGNORE INTO tick (id, day, seconds, area, device) VALUES (?,?,?,?,?)').bind(id, day, s, str(t.area, 20), device),
    );
  }

  // Settings: only these keys, only these shapes.
  const set = (key: string, value: string) =>
    stmts.push(
      db
        .prepare('INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .bind(key, value, new Date().toISOString()),
    );
  const npd = int(body.settings?.new_per_day, 0, 100);
  if (npd !== null) set('new_per_day', String(npd));
  for (const k of ['gre_date', 'toefl_date']) {
    const v = body.settings?.[k];
    if (typeof v === 'string' && DAY.test(v)) set(k, v);
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, wrote: stmts.length });
};
