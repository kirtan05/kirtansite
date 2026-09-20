export const prerender = false;

/**
 * The coach's four taps, and everything that follows from them.
 *
 * This is the only place in the system where a human types a judgement. Every
 * chart, every topic colour and every re-test date is derived from what
 * arrives here — which is exactly why it must stay four taps. The moment
 * grading costs more than a couple of minutes it stops happening in November,
 * and every derived number then freezes while still looking authoritative.
 */
import type { APIRoute } from 'astro';
import { audit, bumpEpoch, requireRole } from '../../../lib/learning/guard';
import { applyGrade, type Outcome } from '../../../lib/learning/engine';
import { attemptKindFor } from '../../../lib/learning/attempts';
import { today } from '../../../lib/learning/dates';

const OUTCOMES = new Set<Outcome>(['solved_alone', 'solved_with_hint', 'stuck', 'not_attempted']);

export const POST: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'coach');
  if (!gate.ok) return gate.response;
  const { db, role } = gate.ctx;

  const isJson = (ctx.request.headers.get('content-type') ?? '').includes('json');
  const body: Record<string, any> = isJson
    ? await ctx.request.json().catch(() => ({}))
    : Object.fromEntries(await ctx.request.formData());

  const action = String(body.action ?? 'grade');

  // ── one problem, one outcome ────────────────────────────────────────
  if (action === 'grade') {
    const entryId = String(body.entry_id ?? '');
    const problemId = String(body.problem_id ?? '');
    const outcome = String(body.outcome ?? '') as Outcome;
    if (!entryId || !problemId || !OUTCOMES.has(outcome)) return new Response('bad grade', { status: 400 });

    const entry = await db
      .prepare('SELECT id, on_date FROM entry WHERE id = ?')
      .bind(entryId)
      .first<{ id: string; on_date: string }>();
    if (!entry) return new Response('unknown entry', { status: 404 });

    let attempt = await db
      .prepare('SELECT id, kind FROM attempt WHERE entry_id = ? AND problem_id = ?')
      .bind(entryId, problemId)
      .first<{ id: string; kind: string }>();

    if (!attempt) {
      // He never marked it. That is common and fine — grading a problem he
      // said nothing about is the usual case for warm-ups.
      const id = crypto.randomUUID();
      const kind = await attemptKindFor(db, problemId, entry.on_date);
      await db
        .prepare('INSERT INTO attempt (id, entry_id, problem_id, kind) VALUES (?, ?, ?, ?)')
        .bind(id, entryId, problemId, kind)
        .run();
      attempt = { id, kind };
    }

    await applyGrade({
      db,
      attemptId: attempt.id,
      problemId,
      outcome,
      kind: attempt.kind as any,
      onDate: entry.on_date,
    });

    return Response.json({ ok: true, attempt_id: attempt.id });
  }

  // ── an attempt that should never have counted ───────────────────────
  if (action === 'void') {
    const attemptId = String(body.attempt_id ?? '');
    const reason = String(body.reason ?? '').slice(0, 300) || 'voided';
    if (!attemptId) return new Response('missing attempt', { status: 400 });
    await db
      .prepare('UPDATE attempt SET voided_at = ?, void_reason = ? WHERE id = ?')
      .bind(new Date().toISOString(), reason, attemptId)
      .run();
    await audit(db, role, 'attempt_voided', `${attemptId}: ${reason}`);
    return Response.json({ ok: true });
  }

  if (action === 'unvoid') {
    const attemptId = String(body.attempt_id ?? '');
    await db.prepare('UPDATE attempt SET voided_at = NULL, void_reason = NULL WHERE id = ?').bind(attemptId).run();
    return Response.json({ ok: true });
  }

  // ── stop asking about a problem, on the record ──────────────────────
  if (action === 'retire') {
    const problemId = String(body.problem_id ?? '');
    const reason = String(body.reason ?? '').slice(0, 300);
    if (!problemId || !reason) return new Response('retiring needs a reason', { status: 400 });
    await db.batch([
      db
        .prepare(
          `INSERT INTO problem_state (problem_id, state, since, reason) VALUES (?, 'retired', ?, ?)
           ON CONFLICT(problem_id) DO UPDATE SET state = 'retired', since = excluded.since, reason = excluded.reason`,
        )
        .bind(problemId, today(), reason),
      db.prepare(`UPDATE retest SET state = 'retired' WHERE problem_id = ? AND state = 'due'`).bind(problemId),
    ]);
    await audit(db, role, 'problem_retired', `${problemId}: ${reason}`);
    return ctx.redirect(ctx.request.headers.get('referer') ?? '/learning/coach');
  }

  // ── close off an evening ────────────────────────────────────────────
  if (action === 'verify') {
    const entryId = String(body.entry_id ?? '');
    const note = String(body.coach_note ?? '').slice(0, 4000) || null;
    const minutes = Number(body.minutes);
    await db
      .prepare(
        `UPDATE entry SET verified_at = ?, coach_note = ?,
                coach_took_pencil = ?, coach_answered_fast = ?, coach_lectured = ?,
                minutes = COALESCE(?, minutes)
          WHERE id = ?`,
      )
      .bind(
        new Date().toISOString(),
        note,
        body.took_pencil ? 1 : 0,
        body.answered_fast ? 1 : 0,
        body.lectured ? 1 : 0,
        Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
        entryId,
      )
      .run();
    await audit(db, role, 'entry_verified', entryId);
    return ctx.redirect('/learning/coach');
  }

  // ── a measured number, not a claimed one ────────────────────────────
  if (action === 'measure') {
    const metric = String(body.metric ?? '');
    const value = Number(body.value);
    if (!metric || !Number.isFinite(value)) return new Response('bad measurement', { status: 400 });
    await db
      .prepare(
        `INSERT INTO measurement (id, on_date, metric, value, unit, upload_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        String(body.on_date ?? today()),
        metric,
        value,
        String(body.unit ?? '') || null,
        String(body.upload_id ?? '') || null,
        String(body.note ?? '').slice(0, 300) || null,
        new Date().toISOString(),
      )
      .run();
    return ctx.redirect(ctx.request.headers.get('referer') ?? '/learning/coach');
  }

  // ── declare a break, so a fortnight off is not scored as neglect ────
  if (action === 'break') {
    const start = String(body.start_on ?? '');
    const end = String(body.end_on ?? '');
    const reason = String(body.reason ?? '').slice(0, 200);
    if (!start || !end || !reason) return new Response('a break needs dates and a reason', { status: 400 });
    await db
      .prepare('INSERT INTO break_period (id, start_on, end_on, reason) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), start, end, reason)
      .run();
    return ctx.redirect('/learning/coach');
  }

  // ── the coach cookie has ended up on his laptop ─────────────────────
  if (action === 'signout_everywhere') {
    await bumpEpoch(db, 'coach');
    await audit(db, role, 'coach_epoch_bumped');
    return ctx.redirect('/learning');
  }

  return new Response('unknown action', { status: 400 });
};
