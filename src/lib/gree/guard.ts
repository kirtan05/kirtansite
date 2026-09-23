/**
 * /gree — the gate.
 *
 * One learner, one password, one long-lived signed cookie per device (phone,
 * office laptop, home laptop). Same shape as /learning's gate and the same
 * password format, so scripts/learning-hash.mjs makes the hash for this too.
 *
 * Order of checks, any "no" ends the request:
 *   1. right hostname (preview builds and *.pages.dev get a 404)
 *   2. bindings present
 *   3. valid, unexpired, correctly signed cookie
 *   4. cookie epoch still current ("sign out everywhere" bumps it)
 */
import type { APIContext, AstroGlobal } from 'astro';
import { verifyPassword } from '../learning/auth';

export { verifyPassword };

type AnyCtx = APIContext | AstroGlobal;

export const COOKIE = 'gree';
const DAYS = 180; // a whole application cycle without being asked again

const enc = new TextEncoder();

function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function sign(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}

export async function issueCookie(secret: string, epoch: number): Promise<{ value: string; maxAge: number }> {
  const maxAge = DAYS * 86400;
  const body = b64u(enc.encode(JSON.stringify({ e: epoch, x: Math.floor(Date.now() / 1000) + maxAge })));
  return { value: `g1.${body}.${b64u(await sign(secret, body))}`, maxAge };
}

export async function readCookie(secret: string, raw: string | undefined): Promise<{ e: number } | null> {
  if (!raw) return null;
  const [v, body, sig] = raw.split('.');
  if (v !== 'g1' || !body || !sig) return null;
  if (!sameBytes(unb64u(sig), await sign(secret, body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (typeof p.x !== 'number' || p.x * 1000 < Date.now() || typeof p.e !== 'number') return null;
    return { e: p.e };
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number) {
  return { path: '/gree', httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge };
}

export function env(ctx: AnyCtx): Env {
  return (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
}

export function hostAllowed(ctx: AnyCtx): boolean {
  const allowed = env(ctx).GREE_HOST;
  if (!allowed || allowed === 'disabled') return false;
  const host = ctx.url.hostname;
  if (host === allowed) return true;
  return import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
}

let epochCache: { value: number; until: number } | null = null;

export async function currentEpoch(db: D1Database): Promise<number> {
  if (epochCache && epochCache.until > Date.now()) return epochCache.value;
  const row = await db.prepare("SELECT value FROM setting WHERE key = 'epoch'").first<{ value: string }>();
  const value = Number(row?.value ?? 1);
  epochCache = { value, until: Date.now() + 60_000 };
  return value;
}

export async function bumpEpoch(db: D1Database): Promise<void> {
  await db
    .prepare("UPDATE setting SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'epoch'")
    .bind(new Date().toISOString())
    .run();
  epochCache = null;
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

/** For pages: a db handle, or a Response (404 / 503 / redirect to login). */
export async function requireUser(ctx: AnyCtx): Promise<{ ok: true; db: D1Database } | { ok: false; response: Response }> {
  if (!hostAllowed(ctx)) return { ok: false, response: notFound() };
  const e = env(ctx);
  const db = e.GREE_DB;
  if (!db || !e.GREE_COOKIE_KEY) {
    return { ok: false, response: new Response('/gree is not configured on this deployment.', { status: 503 }) };
  }
  const payload = await readCookie(e.GREE_COOKIE_KEY, ctx.cookies.get(COOKIE)?.value);
  if (!payload || payload.e !== (await currentEpoch(db))) {
    return { ok: false, response: new Response(null, { status: 302, headers: { location: '/gree' } }) };
  }
  return { ok: true, db };
}

/** For JSON endpoints: same checks, but a 401 the client can act on instead of a redirect. */
export async function requireApi(ctx: APIContext): Promise<{ ok: true; db: D1Database } | { ok: false; response: Response }> {
  const r = await requireUser(ctx);
  if (!r.ok && r.response.status === 302) {
    return { ok: false, response: json({ error: 'signed_out' }, 401) };
  }
  return r;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
