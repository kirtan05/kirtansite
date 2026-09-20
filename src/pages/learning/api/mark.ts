export const prerender = false;

/**
 * His mark on one problem.
 *
 * This writes `kid_mark` and nothing else, ever. The coach's `outcome` lives
 * in a different column on the same row and is never touched here, because
 * the gap between what he thinks he solved and what he can defend is the most
 * informative thing the system collects — and a single column would average
 * it away.
 */
import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/learning/guard';
import { ensureEntry } from '../../../lib/learning/queries';
import { attemptKindFor } from '../../../lib/learning/attempts';

const MARKS = new Set(['got_it', 'tried', 'not_yet']);

export const POST: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'any');
  if (!gate.ok) return gate.response;
  const { db } = gate.ctx;

  let body: { session_id?: string; problem_id?: string; mark?: string | null };
  try {
    body = await ctx.request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const { session_id, problem_id, mark } = body;
  if (!session_id || !problem_id) return new Response('missing fields', { status: 400 });
  if (mark != null && !MARKS.has(mark)) return new Response('bad mark', { status: 400 });

  // The problem must genuinely belong to that session; ids come from a page
  // rendered on a device the boy controls, so they are a claim like any other.
  const owns = await db
    .prepare('SELECT 1 AS ok FROM problem WHERE id = ? AND session_id = ?')
    .bind(problem_id, session_id)
    .first<{ ok: number }>();
  if (!owns) return new Response('unknown problem', { status: 400 });

  const entry = await ensureEntry(db, session_id);
  const now = new Date().toISOString();
  const kind = await attemptKindFor(db, problem_id);

  await db
    .prepare(
      `INSERT INTO attempt (id, entry_id, problem_id, kid_mark, kid_marked_at, kind)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(entry_id, problem_id)
       DO UPDATE SET kid_mark = excluded.kid_mark, kid_marked_at = excluded.kid_marked_at`,
    )
    .bind(crypto.randomUUID(), entry.id, problem_id, mark ?? null, mark ? now : null, kind)
    .run();

  return Response.json({ ok: true, entry_id: entry.id });
};
