/**
 * /net — home router & network monitor gate.
 *
 * Mirrors /gree's single-user auth model:
 *   1. Hostname check (only kirtanjain.com in production; localhost in dev; 404 elsewhere)
 *   2. Bindings check (503 if not configured)
 *   3. PBKDF2 password login -> HMAC-SHA256 HttpOnly cookie (path: /net)
 *   4. Independent write-only bearer token (NETMON_INGEST_TOKEN) for collectors
 */
import type { APIContext, AstroGlobal } from 'astro';
import { verifyPassword } from '../learning/auth';

export { verifyPassword };

type AnyCtx = APIContext | AstroGlobal;

export const COOKIE = 'netmon';
const DAYS = 90;

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

export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function sign(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}

export async function issueCookie(secret: string, epoch: number): Promise<{ value: string; maxAge: number }> {
  const maxAge = DAYS * 86400;
  const body = b64u(enc.encode(JSON.stringify({ e: epoch, x: Math.floor(Date.now() / 1000) + maxAge })));
  return { value: `n1.${body}.${b64u(await sign(secret, body))}`, maxAge };
}

export async function readCookie(secret: string, raw: string | undefined): Promise<{ e: number } | null> {
  if (!raw) return null;
  const [v, body, sig] = raw.split('.');
  if (v !== 'n1' || !body || !sig) return null;
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
  return { path: '/net', httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge };
}

export function env(ctx: AnyCtx): Env {
  return (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
}

export function hostAllowed(ctx: AnyCtx): boolean {
  const allowed = env(ctx).NETMON_HOST;
  if (!allowed || allowed === 'disabled') return false;
  const host = ctx.url.hostname;
  if (host === allowed) return true;
  return import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1');
}

let epochCache: { value: number; until: number } | null = null;

export async function currentEpoch(db: D1Database): Promise<number> {
  if (epochCache && epochCache.until > Date.now()) return epochCache.value;
  const row = await db.prepare("SELECT value FROM net_setting WHERE key = 'epoch'").first<{ value: string }>();
  const value = Number(row?.value ?? 1);
  epochCache = { value, until: Date.now() + 60_000 };
  return value;
}

export async function bumpEpoch(db: D1Database): Promise<void> {
  await db
    .prepare("UPDATE net_setting SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'epoch'")
    .bind(new Date().toISOString())
    .run();
  epochCache = null;
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

export async function requireUser(ctx: AnyCtx): Promise<{ ok: true; db: D1Database } | { ok: false; response: Response }> {
  if (!hostAllowed(ctx)) return { ok: false, response: notFound() };
  const e = env(ctx);
  const db = e.NETMON_DB;
  if (!db || !e.NETMON_COOKIE_KEY) {
    return { ok: false, response: new Response('/net is not configured on this deployment.', { status: 503 }) };
  }
  const payload = await readCookie(e.NETMON_COOKIE_KEY, ctx.cookies.get(COOKIE)?.value);
  if (!payload || payload.e !== (await currentEpoch(db))) {
    return { ok: false, response: new Response(null, { status: 302, headers: { location: '/net' } }) };
  }
  return { ok: true, db };
}

export async function requireApi(ctx: APIContext): Promise<{ ok: true; db: D1Database } | { ok: false; response: Response }> {
  const r = await requireUser(ctx);
  if (!r.ok && r.response.status === 302) {
    return { ok: false, response: json({ error: 'signed_out' }, 401) };
  }
  return r;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** IST calendar date YYYY-MM-DD (UTC+05:30). */
export function istDay(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 10);
}

/** Deterministic compact hex key using FNV-1a 64-bit split across two 32-bit hashes. */
export function stableKey(...parts: string[]): string {
  const input = parts.join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function normMac(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().toLowerCase().replace(/-/g, ':');
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(m)) return null;
  return m;
}
