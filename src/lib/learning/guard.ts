/**
 * /learning — the gate every route goes through.
 *
 * One function, called first in every page and endpoint under /learning. It
 * answers four questions in order, and any "no" ends the request:
 *
 *   1. Are we on the hostname /learning is allowed to serve on?
 *      Preview deployments and *.pages.dev are a second, equally functional
 *      front door onto the same data. robots.txt does not close a door.
 *   2. Are the bindings actually here?
 *   3. Does the request carry a valid, unexpired, correctly-signed cookie?
 *   4. Is the cookie's epoch still current — i.e. has "sign out everywhere"
 *      been used since it was issued?
 *
 * Callers get a narrowed context or a Response to return. They never see a
 * database handle without a role attached, which is what keeps role separation
 * at the query layer rather than in the templates.
 */
import type { APIContext, AstroGlobal } from 'astro';
import { cookieName, readCookie, type Role } from './auth';

export interface Ctx {
  role: Role;
  db: D1Database;
  files: R2Bucket;
  env: Env;
}

type AnyCtx = APIContext | AstroGlobal;

/** Epoch lookups are cached per isolate; a stale epoch delays a forced
 *  sign-out by at most a minute and saves a D1 round trip on every request. */
const epochCache = new Map<string, { value: number; until: number }>();

export async function currentEpoch(db: D1Database, role: Role): Promise<number> {
  const key = `epoch_${role}`;
  const hit = epochCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;

  const row = await db.prepare('SELECT value FROM setting WHERE key = ?').bind(key).first<{ value: string }>();
  const value = Number(row?.value ?? 1);
  epochCache.set(key, { value, until: Date.now() + 60_000 });
  return value;
}

export async function bumpEpoch(db: D1Database, role: Role): Promise<void> {
  const key = `epoch_${role}`;
  await db
    .prepare('UPDATE setting SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = ?')
    .bind(new Date().toISOString(), key)
    .run();
  epochCache.delete(key);
}

function notHere(): Response {
  // 404 rather than 403: on the wrong hostname, /learning should not exist.
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
}

export function bindings(ctx: AnyCtx): { env: Env; db?: D1Database; files?: R2Bucket } {
  const env = (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
  return { env, db: env.LEARNING_DB, files: env.LEARNING_FILES };
}

/**
 * True when this deployment is allowed to serve /learning at all.
 *
 * The localhost exemption is compiled out of production builds. It would
 * otherwise be a standing invitation to try a spoofed `Host: localhost`
 * against the real Worker — unlikely to route, but the whole point of this
 * check is that it does not depend on how routing happens to behave.
 */
export function hostAllowed(ctx: AnyCtx): boolean {
  const { env } = bindings(ctx);
  const allowed = env.LEARNING_HOST;
  if (!allowed || allowed === 'disabled') return false;

  const host = ctx.url.hostname;
  if (host === allowed) return true;
  return import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
}

/**
 * Require a session. `need` of 'coach' rejects the kid role; 'any' accepts
 * either. Returns either a context or a Response the caller must return.
 */
export async function requireRole(
  ctx: AnyCtx,
  need: Role | 'any' = 'any',
): Promise<{ ok: true; ctx: Ctx } | { ok: false; response: Response }> {
  if (!hostAllowed(ctx)) return { ok: false, response: notHere() };

  const { env, db, files } = bindings(ctx);
  if (!db || !files) {
    return {
      ok: false,
      response: new Response('The learning area is not configured on this deployment.', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      }),
    };
  }

  const secret = env.LEARNING_COOKIE_KEY;
  const payload = secret ? await readCookie(secret, ctx.cookies.get(cookieName)?.value) : null;

  if (!payload) return { ok: false, response: redirectToLogin(ctx) };

  if (payload.e !== (await currentEpoch(db, payload.r))) {
    ctx.cookies.delete(cookieName, { path: '/learning' });
    return { ok: false, response: redirectToLogin(ctx) };
  }

  // The kid role never receives coach routes — and, because the caller only
  // gets `db` through this function, never reaches a coach query either.
  if (need === 'coach' && payload.r !== 'coach') {
    return { ok: false, response: notHere() };
  }

  return { ok: true, ctx: { role: payload.r, db, files, env } };
}

function redirectToLogin(ctx: AnyCtx): Response {
  const next = ctx.url.pathname + ctx.url.search;
  const to = next === '/learning' || next === '/learning/' ? '/learning' : `/learning?next=${encodeURIComponent(next)}`;
  return new Response(null, { status: 302, headers: { location: to } });
}

/** Record something worth being able to look up later. Never throws. */
export async function audit(db: D1Database, role: string, action: string, detail?: string): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO audit (id, at, role, action, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), new Date().toISOString(), role, action, detail ?? null)
      .run();
  } catch {
    /* auditing must never be the reason a request fails */
  }
}
