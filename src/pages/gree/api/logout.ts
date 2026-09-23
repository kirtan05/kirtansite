export const prerender = false;

import type { APIRoute } from 'astro';
import { bumpEpoch, COOKIE, hostAllowed, requireUser } from '../../../lib/gree/guard';

/** ?everywhere=1 also signs out every other device. */
export const POST: APIRoute = async (ctx) => {
  if (!hostAllowed(ctx)) return new Response('Not found', { status: 404 });
  if (ctx.url.searchParams.get('everywhere') === '1') {
    const g = await requireUser(ctx);
    if (g.ok) await bumpEpoch(g.db);
  }
  ctx.cookies.delete(COOKIE, { path: '/gree' });
  return ctx.redirect('/gree');
};
