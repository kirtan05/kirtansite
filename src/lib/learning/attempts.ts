/**
 * Deciding what kind of attempt this is.
 *
 * The distinction matters because the three kinds mean different things and
 * must not be pooled:
 *
 *   first     — the first honest meeting with this problem. Only these
 *               contribute to "speed of acquisition".
 *   carryover — he has met it before and it is still open. Repeated carryovers
 *               are what "blocked" is made of.
 *   retest    — the scheduler asked for it again weeks later. Only these say
 *               anything about retention, and they are the only reason the
 *               system can see forgetting at all.
 *
 * It is computed once, when the attempt row is created, from the state of the
 * problem at that moment — not re-derived later, when the state has moved on.
 */
import { today } from './dates';

export type AttemptKind = 'first' | 'carryover' | 'retest';

export async function attemptKindFor(db: D1Database, problemId: string, on = today()): Promise<AttemptKind> {
  const [due, state] = await db.batch<any>([
    db.prepare(`SELECT 1 AS hit FROM retest WHERE problem_id = ? AND state = 'due' AND due_on <= ? LIMIT 1`).bind(problemId, on),
    db.prepare(`SELECT state FROM problem_state WHERE problem_id = ?`).bind(problemId),
  ]);

  if (due.results?.length) return 'retest';
  const s = state.results?.[0]?.state;
  if (s === 'open') return 'carryover';
  if (s === 'solved') return 'retest'; // asked again out of schedule; still a retention signal
  return 'first';
}
