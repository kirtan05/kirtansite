export const prerender = false;

/**
 * Serve one stored file.
 *
 * The bucket is private and has no public URL. Every read goes through here,
 * which means every read has a role attached and can be revoked by rotating a
 * cookie epoch. The alternative — a public bucket with unguessable keys —
 * makes a child's photographs permanently and unauthenticatedly readable by
 * anyone who ever sees one link.
 */
import type { APIRoute } from 'astro';
import { requireRole } from '../../../../lib/learning/guard';

export const GET: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'any');
  if (!gate.ok) return gate.response;
  const { db, files } = gate.ctx;

  const id = ctx.params.id;
  if (!id) return new Response('not found', { status: 404 });

  const row = await db
    .prepare('SELECT r2_key, mime, filename FROM upload WHERE id = ?')
    .bind(id)
    .first<{ r2_key: string; mime: string; filename: string }>();
  if (!row) return new Response('not found', { status: 404 });

  const obj = await files.get(row.r2_key);
  if (!obj) return new Response('the file is recorded but missing from storage', { status: 410 });

  return new Response(obj.body, {
    headers: {
      'content-type': row.mime,
      'content-disposition': `inline; filename="${row.filename.replace(/"/g, '')}"`,
      // Private, and short: a shared laptop should not keep these in its cache.
      'cache-control': 'private, max-age=60',
      'x-content-type-options': 'nosniff',
      // A stored image is untrusted content served from our own origin.
      'content-security-policy': "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
    },
  });
};
