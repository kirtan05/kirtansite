export const prerender = false;

import type { APIRoute } from 'astro';
import { bumpEpoch, COOKIE, cookieOptions, json, requireApi } from '../../../lib/netmon/guard';

export const POST: APIRoute = async (ctx) => {
  const gate = await requireApi(ctx);
  if (!gate.ok) return gate.response;

  let all = false;
  try {
    const b = await ctx.request.json();
    all = Boolean(b?.all);
  } catch {
    // empty body is fine
  }

  if (all) await bumpEpoch(gate.db);
  ctx.cookies.delete(COOKIE, { path: cookieOptions(0).path });
  return json({ ok: true });
};
