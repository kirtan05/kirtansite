export const prerender = false;

/**
 * The whole database as one JSON document.
 *
 * This exists because D1 and R2 are a single point of failure holding several
 * years of a child's work, and "we will add an export in phase 5" is how that
 * kind of data gets lost — the destructive window is the months of schema
 * churn *before* phase 5, not after it.
 *
 * scripts/learning-export.mjs turns this, plus the files, into a plain folder
 * of dated directories that will still open in twenty years with no software
 * at all. Run it before every migration.
 */
import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/learning/guard';
import { today } from '../../../lib/learning/dates';

const TABLES = [
  'course', 'session', 'problem', 'problem_answer', 'topic', 'problem_topic', 'task',
  'planned', 'break_period', 'entry', 'attempt', 'problem_state', 'retest',
  'upload', 'measurement', 'setting', 'audit',
];

export const GET: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'coach');
  if (!gate.ok) return gate.response;
  const { db } = gate.ctx;

  // One statement per table, batched: comfortably inside the free plan's
  // 50-queries-per-invocation ceiling, with room to add tables later.
  const results = await db.batch(TABLES.map((t) => db.prepare(`SELECT * FROM ${t}`)));

  const dump: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
  };
  TABLES.forEach((t, i) => {
    dump[t] = results[i].results ?? [];
  });

  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="learning-${today()}.json"`,
      'cache-control': 'no-store',
    },
  });
};
