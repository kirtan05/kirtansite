export const prerender = false;

import type { APIRoute } from 'astro';
import { json, requireApi } from '../../../lib/gree/guard';
import { CONTENT_VERSION } from '../../../data/gree/version';

/** Everything a device needs to pick up where another one left off. */
export const GET: APIRoute = async (ctx) => {
  const g = await requireApi(ctx);
  if (!g.ok) return g.response;
  const db = g.db;

  const since = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);

  const [cards, qs, settings, ans, ticks, logDays, logs, essays] = await db.batch([
    db.prepare('SELECT word_id, box, due, right_n, wrong_n, first_at, last_at FROM card'),
    db.prepare('SELECT qid, box, due, right_n, wrong_n, last_at FROM qstate'),
    db.prepare('SELECT key, value FROM setting WHERE key != ?').bind('epoch'),
    db
      .prepare(
        `SELECT day,
                COUNT(*) AS n,
                SUM(correct) AS ok,
                SUM(kind = 'new') AS new_n,
                SUM(kind = 'question') AS q_n,
                SUM(kind = 'question' AND correct = 1) AS q_ok
           FROM answer WHERE day >= ? GROUP BY day`,
      )
      .bind(since),
    db.prepare('SELECT day, SUM(seconds) AS s FROM tick WHERE day >= ? GROUP BY day').bind(since),
    db.prepare('SELECT day, SUM(minutes) AS m FROM log WHERE day >= ? GROUP BY day').bind(since),
    db.prepare('SELECT id, day, kind, minutes, note FROM log ORDER BY day DESC, at DESC LIMIT 60'),
    db.prepare('SELECT id, day, task, prompt, words, seconds, feedback IS NOT NULL AS graded, at FROM essay ORDER BY at DESC LIMIT 100'),
  ]);

  // One row per day that had anything in it.
  const days: Record<string, { s: number; n: number; ok: number; new: number; q: number; qok: number; logm: number }> = {};
  const day = (d: string) => (days[d] ??= { s: 0, n: 0, ok: 0, new: 0, q: 0, qok: 0, logm: 0 });
  for (const r of ans.results as any[]) Object.assign(day(r.day), { n: r.n, ok: r.ok ?? 0, new: r.new_n ?? 0, q: r.q_n ?? 0, qok: r.q_ok ?? 0 });
  for (const r of ticks.results as any[]) day(r.day).s = r.s ?? 0;
  for (const r of logDays.results as any[]) day(r.day).logm = r.m ?? 0;

  return json({
    contentVersion: CONTENT_VERSION,
    cards: (cards.results as any[]).map((c) => [c.word_id, c.box, c.due, c.right_n, c.wrong_n, c.first_at, c.last_at]),
    qstate: (qs.results as any[]).map((q) => [q.qid, q.box, q.due, q.right_n, q.wrong_n, q.last_at]),
    settings: Object.fromEntries((settings.results as any[]).map((s) => [s.key, s.value])),
    days,
    logs: logs.results,
    essays: essays.results,
  });
};
