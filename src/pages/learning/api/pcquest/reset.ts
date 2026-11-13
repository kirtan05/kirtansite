export const prerender = false;

/**
 * POST /learning/api/pcquest/reset — `quest reset <task>` (coach token).
 * Body: { task }. He gets a fresh attempt on his next sync: the app applies a
 * reset only when its `at` is newer than the attempt it holds, so this row
 * can stay put. Any approval for the task is removed too, so the fresh
 * attempt's `parent` check waits for a fresh `quest approve`. Events are
 * never deleted; the app's own `reset` event is what clears the task in
 * `progress`.
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../lib/learning/pcquest-auth';

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;

  const body = await readJson(ctx);
  const task = body?.task;
  if (typeof task !== 'string' || !task || task.length > 128) return bad('missing task');
  const at = new Date().toISOString();

  const db = env.PCQUEST_DB;
  await db.batch([
    db.prepare('INSERT INTO pq_reset (task, at) VALUES (?, ?) ON CONFLICT(task) DO UPDATE SET at = excluded.at').bind(task, at),
    db.prepare('DELETE FROM pq_approval WHERE task = ?').bind(task),
  ]);
  return json({ ok: true, task, at, approvalCleared: true });
};
