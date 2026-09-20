export const prerender = false;

/**
 * Serve a printable sheet out of R2.
 *
 * The sheets are not in public/. A student sheet is only mildly sensitive, but
 * the coach version of the same sheet carries every answer, and the two differ
 * by one word in the filename — putting either in a publicly served directory
 * makes that one word the entire access control.
 */
import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/learning/guard';

export const GET: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'any');
  if (!gate.ok) return gate.response;
  const { files, role } = gate.ctx;

  const name = String(ctx.params.name ?? '');
  // Filenames only: no traversal, no nesting.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(name)) return new Response('not found', { status: 404 });

  if (/COACH/i.test(name) && role !== 'coach') return new Response('not found', { status: 404 });

  const obj = await files.get(`sheets/${name}`);
  if (!obj) return new Response('not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/pdf',
      'content-disposition': `inline; filename="${name}"`,
      // Cache-Control is set for every /learning response in src/middleware.ts.
      'x-content-type-options': 'nosniff',
    },
  });
};
