export const prerender = false;

/**
 * Climb a rung of the computer ladder.
 *
 * Two states rather than one, mirroring the maths side: he *claims*, his
 * father *confirms*. The concept rungs — "say what a path is" — are the ones
 * that get skipped, because they leave no file behind, so they are the reason
 * this endpoint exists at all rather than the presence of an upload being
 * taken as proof on its own.
 */
import type { APIRoute } from 'astro';
import { audit, requireRole } from '../../../lib/learning/guard';
import { today } from '../../../lib/learning/dates';

export const POST: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'any');
  if (!gate.ok) return gate.response;
  const { db, role } = gate.ctx;

  const isJson = (ctx.request.headers.get('content-type') ?? '').includes('json');
  const body: Record<string, any> = isJson
    ? await ctx.request.json().catch(() => ({}))
    : Object.fromEntries(await ctx.request.formData());

  const taskId = String(body.task_id ?? '');
  const want = String(body.state ?? '');
  if (!taskId) return new Response('missing task', { status: 400 });

  // The boy can claim and un-claim. Only the coach can confirm, and only the
  // coach can record a rung as deliberately skipped.
  const allowed = role === 'coach' ? ['todo', 'claimed', 'done', 'skipped'] : ['todo', 'claimed'];
  if (!allowed.includes(want)) return new Response('not allowed to set that', { status: 403 });

  await db
    .prepare(
      `INSERT INTO task_state (task_id, state, on_date, note, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET state = excluded.state, on_date = excluded.on_date,
                                          note = COALESCE(excluded.note, task_state.note),
                                          updated_at = excluded.updated_at`,
    )
    .bind(taskId, want, today(), String(body.note ?? '').slice(0, 300) || null, new Date().toISOString())
    .run();

  await audit(db, role, 'task_state', `${taskId} -> ${want}`);

  if (!isJson) return ctx.redirect(ctx.request.headers.get('referer') ?? '/learning/today');
  return Response.json({ ok: true, state: want });
};
