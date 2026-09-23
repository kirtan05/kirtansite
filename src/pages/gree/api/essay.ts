export const prerender = false;

import type { APIRoute } from 'astro';
import { json, requireApi } from '../../../lib/gree/guard';

const TASKS = new Set(['gre_issue', 'toefl_email', 'toefl_discussion', 'free']);

/** GET ?id= returns one essay in full; the list comes with /state. */
export const GET: APIRoute = async (ctx) => {
  const g = await requireApi(ctx);
  if (!g.ok) return g.response;
  const id = ctx.url.searchParams.get('id');
  if (!id) return json({ error: 'missing_id' }, 400);
  const row = await g.db.prepare('SELECT * FROM essay WHERE id = ?').bind(id).first();
  return row ? json(row) : json({ error: 'not_found' }, 404);
};

/** Save (create or overwrite) a draft. Autosaved from the editor. */
export const POST: APIRoute = async (ctx) => {
  const g = await requireApi(ctx);
  if (!g.ok) return g.response;
  const b: any = await ctx.request.json().catch(() => null);
  if (!b) return json({ error: 'bad_json' }, 400);

  if (b.op === 'delete' && typeof b.id === 'string') {
    await g.db.prepare('DELETE FROM essay WHERE id = ?').bind(b.id).run();
    return json({ ok: true });
  }

  if (
    typeof b.id !== 'string' || b.id.length > 64 ||
    !TASKS.has(b.task) ||
    typeof b.prompt !== 'string' || b.prompt.length > 4000 ||
    typeof b.body !== 'string' || b.body.length > 30000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.day ?? '')
  ) {
    return json({ error: 'bad_essay' }, 400);
  }
  const now = new Date().toISOString();
  const words = (b.body.match(/\S+/g) ?? []).length;
  const seconds = Number.isInteger(b.seconds) ? Math.min(b.seconds, 86400) : null;
  const checks = Array.isArray(b.checks) ? JSON.stringify(b.checks.slice(0, 20)) : null;
  await g.db
    .prepare(
      `INSERT INTO essay (id, day, task, prompt, body, words, seconds, checks, at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET task = excluded.task, prompt = excluded.prompt, body = excluded.body,
         words = excluded.words, seconds = excluded.seconds, checks = excluded.checks, updated_at = excluded.updated_at`,
    )
    .bind(b.id, b.day, b.task, b.prompt, b.body, words, seconds, checks, now, now)
    .run();
  return json({ ok: true, words });
};
