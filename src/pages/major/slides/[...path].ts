export const prerender = false;

import type { APIRoute } from 'astro';
import { requireFiles, serveObject } from '../../../lib/major/guard';

/**
 * Slide images. Keys are `slides/<deck>/p-NNN.jpg`; anything else is refused
 * before touching the bucket. `private` keeps them out of Cloudflare's shared
 * cache (see middleware.ts), but lets the signed-in browser keep them, since
 * a slide never changes and a revision session flips through hundreds.
 */
export const GET: APIRoute = async (ctx) => {
  const g = await requireFiles(ctx);
  if (!g.ok) return g.response;
  const path = ctx.params.path ?? '';
  if (!/^[A-Za-z0-9_-]+\/p-\d{1,4}\.jpg$/.test(path)) return new Response('Not found', { status: 404 });
  return serveObject(g.files, `slides/${path}`, 'image/jpeg', 'private, max-age=604800, immutable');
};
