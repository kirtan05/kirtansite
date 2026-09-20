export const prerender = false;

import type { APIRoute } from 'astro';
import { cookieName } from '../../../lib/learning/auth';
import { audit, bindings, hostAllowed } from '../../../lib/learning/guard';

export const POST: APIRoute = async (ctx) => {
  if (!hostAllowed(ctx)) return new Response('Not found', { status: 404 });
  const { db } = bindings(ctx);
  ctx.cookies.delete(cookieName, { path: '/learning' });
  if (db) await audit(db, 'unknown', 'logout');
  return ctx.redirect('/learning');
};
