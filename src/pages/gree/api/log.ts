export const prerender = false;

import type { APIRoute } from 'astro';
import { json, requireApi } from '../../../lib/gree/guard';

/** Off-site work: POWERPREP, videos, a book, TOEFL practice. */
export const POST: APIRoute = async (ctx) => {
  const g = await requireApi(ctx);
  if (!g.ok) return g.response;
  const b: any = await ctx.request.json().catch(() => null);
  if (!b) return json({ error: 'bad_json' }, 400);

  if (b.op === 'delete' && typeof b.id === 'string') {
    await g.db.prepare('DELETE FROM log WHERE id = ?').bind(b.id).run();
    return json({ ok: true });
  }

  const minutes = Number(b.minutes);
  if (
    typeof b.id !== 'string' || b.id.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.day ?? '') ||
    typeof b.kind !== 'string' || b.kind.length > 40 ||
    !Number.isInteger(minutes) || minutes < 1 || minutes > 600
  ) {
    return json({ error: 'bad_entry' }, 400);
  }
  await g.db
    .prepare('INSERT OR IGNORE INTO log (id, day, kind, minutes, note, at) VALUES (?,?,?,?,?,?)')
    .bind(b.id, b.day, b.kind, minutes, typeof b.note === 'string' ? b.note.slice(0, 500) : null, new Date().toISOString())
    .run();
  return json({ ok: true });
};
