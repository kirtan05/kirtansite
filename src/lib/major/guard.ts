/**
 * /major — the gate.
 *
 * Quiz revision for Major Chandrakant Nair's quizzes. One shared password,
 * one long-lived signed cookie per device. It borrows /gree's cookie and
 * password primitives wholesale; the only differences are the cookie name and
 * path, and that there is no database (so no "sign out everywhere" epoch).
 *
 * Order of checks, any "no" ends the request:
 *   1. right hostname (preview builds and *.pages.dev get a 404)
 *   2. bindings present
 *   3. valid, unexpired, correctly signed cookie
 */
import type { APIContext, AstroGlobal } from 'astro';
import { issueCookie as issueGreeCookie, readCookie, verifyPassword } from '../gree/guard';

export { verifyPassword };

type AnyCtx = APIContext | AstroGlobal;

export const COOKIE = 'major';
const EPOCH = 1; // no DB, so no epoch to bump; rotate MAJOR_COOKIE_KEY to sign everyone out

export function env(ctx: AnyCtx): Env {
  return (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
}

export function hostAllowed(ctx: AnyCtx): boolean {
  const allowed = env(ctx).MAJOR_HOST;
  if (!allowed || allowed === 'disabled') return false;
  const host = ctx.url.hostname;
  if (host === allowed) return true;
  return import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
}

export function issueCookie(secret: string) {
  return issueGreeCookie(secret, EPOCH);
}

export function cookieOptions(maxAge: number) {
  return { path: '/major', httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge };
}

export async function signedIn(ctx: AnyCtx): Promise<boolean> {
  const secret = env(ctx).MAJOR_COOKIE_KEY;
  if (!secret) return false;
  const p = await readCookie(secret, ctx.cookies.get(COOKIE)?.value);
  return !!p && p.e === EPOCH;
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

/** For endpoints: the R2 bucket, or a Response (404 / 503 / 401). */
export async function requireFiles(ctx: APIContext): Promise<{ ok: true; files: R2Bucket } | { ok: false; response: Response }> {
  if (!hostAllowed(ctx)) return { ok: false, response: notFound() };
  const e = env(ctx);
  if (!e.MAJOR_FILES || !e.MAJOR_COOKIE_KEY) {
    return { ok: false, response: new Response('/major is not configured on this deployment.', { status: 503 }) };
  }
  if (!(await signedIn(ctx))) {
    return { ok: false, response: new Response('Signed out', { status: 401, headers: { 'content-type': 'text/plain' } }) };
  }
  return { ok: true, files: e.MAJOR_FILES };
}

/** Stream an R2 object back, or 404. */
export async function serveObject(files: R2Bucket, key: string, contentType: string, cacheControl: string): Promise<Response> {
  const obj = await files.get(key);
  if (!obj) return notFound();
  return new Response(obj.body, {
    headers: { 'content-type': contentType, 'cache-control': cacheControl, etag: obj.httpEtag },
  });
}
