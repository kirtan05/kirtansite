export const prerender = false;

/**
 * Open, close and re-open an evening.
 *
 * Closing is his action and means "I have finished for today", not "this is
 * correct". Grading is a separate, later, coach-only act — the two were one
 * field in the first draft, which made his own tick look like a verified
 * result on every chart downstream.
 */
import type { APIRoute } from 'astro';
import { audit, requireRole } from '../../../lib/learning/guard';
import { today } from '../../../lib/learning/dates';

export const POST: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'any');
  if (!gate.ok) return gate.response;
  const { db, role } = gate.ctx;

  const form = await ctx.request.formData();
  const action = String(form.get('action') ?? '');
  const entryId = String(form.get('entry_id') ?? '');
  if (!entryId) return new Response('missing entry', { status: 400 });

  if (action === 'close') {
    const fav = String(form.get('favourite_problem_id') ?? '') || null;
    const note = String(form.get('kid_note') ?? '').slice(0, 2000) || null;
    await db
      .prepare('UPDATE entry SET closed_at = ?, favourite_problem_id = ?, kid_note = ? WHERE id = ?')
      .bind(new Date().toISOString(), fav, note, entryId)
      .run();
    await audit(db, role, 'entry_closed', entryId);
    return ctx.redirect('/learning/today');
  }

  if (action === 'reopen') {
    // Only the coach may reopen: undoing a close after grading has begun
    // would let graded attempts drift back into an "in progress" evening.
    if (role !== 'coach') return new Response('not found', { status: 404 });
    await db.prepare('UPDATE entry SET closed_at = NULL WHERE id = ?').bind(entryId).run();
    await audit(db, role, 'entry_reopened', entryId);
    return ctx.redirect('/learning/coach/grade');
  }

  if (action === 'minutes') {
    const m = Number(form.get('minutes'));
    if (Number.isFinite(m) && m >= 0 && m < 600) {
      await db.prepare('UPDATE entry SET minutes = ? WHERE id = ?').bind(Math.round(m), entryId).run();
    }
    return ctx.redirect(ctx.request.headers.get('referer') ?? '/learning/today');
  }

  return new Response('unknown action', { status: 400 });
};
