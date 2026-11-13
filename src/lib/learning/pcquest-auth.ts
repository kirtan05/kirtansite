/**
 * PC Quest — the gate every /learning/api/pcquest route goes through.
 *
 * Like the activity monitor, these routes are not behind the coach cookie: a
 * Windows app and a CLI cannot carry one. They authenticate with one of two
 * bearer tokens, compared in constant time:
 *
 *   kid   — on his laptop. GET sync and POST events only. A leaked kid token
 *           can read the packs and his own progress and write junk events; it
 *           can never push a pack (that needs the coach token AND a signature
 *           from the key on Kirtan's box).
 *   coach — on Kirtan's box (`quest`). Everything else.
 *
 * Order: wrong host → 404, missing binding or secret → 503, wrong or missing
 * token → 401. The kid token is not accepted where the coach's is needed,
 * and vice versa.
 */
import type { APIContext } from 'astro';
import { hostAllowed } from './guard';

export type PqEnv = Env & { PCQUEST_DB: D1Database };

export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function bearer(ctx: APIContext, which: 'kid' | 'coach'): PqEnv | Response {
  if (!hostAllowed(ctx)) return new Response('Not found', { status: 404 });

  const env = (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
  const token = which === 'kid' ? env.PCQUEST_KID_TOKEN : env.PCQUEST_COACH_TOKEN;
  if (!env.PCQUEST_DB || !token) return new Response('pcquest not configured here', { status: 503 });

  const auth = ctx.request.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || !sameString(presented, token)) return new Response('no', { status: 401 });

  return env as PqEnv;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export function bad(msg: string, status = 400): Response {
  return new Response(msg, { status, headers: { 'content-type': 'text/plain' } });
}

/** Parse a JSON body, or null when it isn't JSON. */
export async function readJson(ctx: APIContext): Promise<any | null> {
  try {
    return await ctx.request.json();
  } catch {
    return null;
  }
}
