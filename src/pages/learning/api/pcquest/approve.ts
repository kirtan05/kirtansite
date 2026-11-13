export const prerender = false;

/**
 * POST /learning/api/pcquest/approve — `quest approve <task> [note]` (coach
 * token). Body: { task, note? }. Passes that task's `parent` check on his
 * next sync. Approving again just updates the time and note.
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../lib/learning/pcquest-auth';

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;

  const body = await readJson(ctx);
  const task = body?.task;
  if (typeof task !== 'string' || !task || task.length > 128) return bad('missing task');
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null;
  const at = new Date().toISOString();

  await env.PCQUEST_DB
    .prepare(
      `INSERT INTO pq_approval (task, at, note) VALUES (?, ?, ?)
       ON CONFLICT(task) DO UPDATE SET at = excluded.at, note = excluded.note`,
    )
    .bind(task, at, note)
    .run();
  return json({ ok: true, task, at, note });
};
