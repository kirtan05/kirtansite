export const prerender = false;

/**
 * POST /learning/api/pcquest/agent — the PC Quest helper agent (coach token).
 * Body: { run?: {laptopOnline, open, note?}, summary?: string, actions?: [{task, action, steps?, reason}] }.
 * `summary` is the daily "how is he doing" text shown on the coach page.
 *
 * - action "credit": writes a `step` event for each listed step (detail
 *   {by:'agent', reason}) and a `done` event when that finishes the task. The
 *   app merges server progress on its next sync, so he sees it ticked.
 * - action "reset": same as `quest reset` (fresh attempt next sync).
 * - action "wait": nothing changes; the reason is logged for the dashboard.
 * Every action is logged in pq_agent_log.
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../lib/learning/pcquest-auth';
import { loadPacks, loadProgress, taskMetaOf } from '../../../../lib/learning/pcquest-db';

const ACTIONS = new Set(['credit', 'reset', 'wait', 'note']);

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;
  const body = await readJson(ctx);
  if (!body || typeof body !== 'object') return bad('missing body');
  const db = env.PCQUEST_DB;
  const at = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  if (body.run && typeof body.run === 'object') {
    const run = {
      at,
      laptopOnline: body.run.laptopOnline === true,
      open: Number(body.run.open) || 0,
      note: typeof body.run.note === 'string' ? body.run.note.slice(0, 500) : null,
    };
    stmts.push(
      db.prepare(`INSERT INTO pq_agent_state (key, value) VALUES ('last_run', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(run)),
    );
  }

  if (typeof body.summary === 'string' && body.summary.trim()) {
    stmts.push(
      db.prepare(`INSERT INTO pq_agent_state (key, value) VALUES ('summary', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(JSON.stringify({ at, text: body.summary.slice(0, 4000) })),
    );
  }

  const actions = Array.isArray(body.actions) ? body.actions.slice(0, 50) : [];
  const results: unknown[] = [];
  if (actions.length) {
    const [packs, progress] = await Promise.all([loadPacks(db, false), loadProgress(db)]);
    const meta = new Map(taskMetaOf(packs).map((t) => [t.id, t]));
    for (const a of actions) {
      const task = typeof a?.task === 'string' ? a.task : '';
      const action = String(a?.action ?? '');
      const reason = typeof a?.reason === 'string' ? a.reason.slice(0, 1000) : '';
      if (!task || !ACTIONS.has(action) || !reason) { results.push({ task, error: 'bad action' }); continue; }
      const t = meta.get(task);
      const p = progress[task];
      if (!t) { results.push({ task, error: 'unknown task' }); continue; }

      let steps: string[] = [];
      if (action === 'credit') {
        if (!p || p.state !== 'in_progress') { results.push({ task, error: 'not in progress' }); continue; }
        const known = new Set(t.stepIds ?? []);
        steps = (Array.isArray(a.steps) ? a.steps : []).filter(
          (s: unknown): s is string => typeof s === 'string' && known.has(s) && !p.steps[s],
        );
        if (!steps.length) { results.push({ task, error: 'no creditable steps' }); continue; }
        const detail = JSON.stringify({ by: 'agent', reason: reason.slice(0, 300) });
        steps.forEach((s, i) => {
          const ev = new Date(Date.now() + i).toISOString();
          stmts.push(
            db.prepare(`INSERT INTO pq_event (id, device_id, at, received_at, kind, task, rev, step, detail)
                        VALUES (?, 'agent', ?, ?, 'step', ?, ?, ?, ?)`)
              .bind(crypto.randomUUID(), ev, at, task, p.rev, s, detail),
          );
        });
        const all = (t.stepIds ?? []).every((s) => p.steps[s] || steps.includes(s));
        if (all) {
          stmts.push(
            db.prepare(`INSERT INTO pq_event (id, device_id, at, received_at, kind, task, rev, step, detail)
                        VALUES (?, 'agent', ?, ?, 'done', ?, ?, NULL, ?)`)
              .bind(crypto.randomUUID(), new Date(Date.now() + steps.length).toISOString(), at, task, p.rev, detail),
          );
        }
      } else if (action === 'reset') {
        stmts.push(
          db.prepare('INSERT INTO pq_reset (task, at) VALUES (?, ?) ON CONFLICT(task) DO UPDATE SET at = excluded.at').bind(task, at),
          db.prepare('DELETE FROM pq_approval WHERE task = ?').bind(task),
        );
      }
      stmts.push(
        db.prepare('INSERT INTO pq_agent_log (at, task, action, steps, reason) VALUES (?, ?, ?, ?, ?)')
          .bind(at, task, action, steps.length ? JSON.stringify(steps) : null, reason),
      );
      results.push({ task, action, steps });
    }
  }
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, at, results });
};
