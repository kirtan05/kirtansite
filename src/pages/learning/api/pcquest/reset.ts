export const prerender = false;

/**
 * POST /learning/api/pcquest/reset — `quest reset <task>` (coach token).
 * Body: { task }. He gets a fresh attempt on his next sync: the app applies a
 * reset only when its `at` is newer than the attempt it holds, so this row
 * can stay put. History is never deleted; the app's own `reset` event is what
 * clears the task in `progress`.
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

  await env.PCQUEST_DB
    .prepare('INSERT INTO pq_reset (task, at) VALUES (?, ?) ON CONFLICT(task) DO UPDATE SET at = excluded.at')
    .bind(task, at)
    .run();
  return json({ ok: true, task, at });
};
