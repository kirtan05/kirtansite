/**
 * /learning — authentication.
 *
 * Two shared passwords, two roles, one signed cookie. Read docs/learning/
 * security.md before changing any of this; several choices here are
 * deliberately weaker or stronger than they first look.
 *
 * Honest summary of what this is: a lock on a door nobody knows about. It
 * keeps the URL from being casually browsable and keeps the coach screens away
 * from the boy. It is not a defence against a determined attacker, and the
 * free Cloudflare plan gives us nothing to rate-limit with, so pretending
 * otherwise in the code would be theatre.
 */

export type Role = 'kid' | 'coach';

const COOKIE = 'lrn';
const KID_DAYS = 90;   // he should never be asked to log in again
const COACH_HOURS = 12; // grading happens in one sitting; the cookie should not outlive it

// ────────────────────────────────────────────────────────── primitives

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

/** Length-independent, value-constant comparison. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// ────────────────────────────────────────────────────────── passwords

/**
 * Verify a password against a `pbkdf2$<iters>$<salt>$<hash>` record.
 *
 * The iteration count lives in the record, not in this file, so it can be
 * lowered without a deploy if it ever bumps into the free plan's 10ms CPU
 * ceiling — exceeding that would kill the login request outright, which is a
 * far worse failure than a slightly cheaper KDF on a shared family password.
 * scripts/learning-hash.mjs defaults to 10,000, which measures well under it.
 */
export async function verifyPassword(record: string | undefined, password: string): Promise<boolean> {
  if (!record) return false;
  const [scheme, itersRaw, saltRaw, hashRaw] = record.split('$');
  if (scheme !== 'pbkdf2' || !itersRaw || !saltRaw || !hashRaw) return false;

  const iterations = Number(itersRaw);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 200_000) return false;

  const expected = unb64u(hashRaw);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(saltRaw), iterations },
    key,
    expected.length * 8,
  );
  return sameBytes(new Uint8Array(bits), expected);
}

// ────────────────────────────────────────────────────────── the cookie

interface Payload {
  r: Role;
  e: number;  // the role's epoch at issue time
  x: number;  // expiry, seconds since the epoch
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

export async function issueCookie(secret: string, role: Role, epoch: number): Promise<{ value: string; maxAge: number }> {
  const maxAge = role === 'coach' ? COACH_HOURS * 3600 : KID_DAYS * 86400;
  const payload: Payload = { r: role, e: epoch, x: Math.floor(Date.now() / 1000) + maxAge };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return { value: `v1.${body}.${sig}`, maxAge };
}

export async function readCookie(secret: string, raw: string | undefined): Promise<Payload | null> {
  if (!raw) return null;
  const [v, body, sig] = raw.split('.');
  if (v !== 'v1' || !body || !sig) return null;

  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  if (!sameBytes(unb64u(sig), expected)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64u(body)));
  } catch {
    return null;
  }
  if (payload.r !== 'kid' && payload.r !== 'coach') return null;
  if (typeof payload.x !== 'number' || payload.x * 1000 < Date.now()) return null;
  return payload;
}

export const cookieName = COOKIE;

/** Cookie attributes. Path is the whole site because Astro's own redirects
 *  bounce through `/learning` and a narrower path drops the cookie on some
 *  mobile browsers during a redirect chain. */
export function cookieOptions(maxAge: number) {
  return {
    path: '/learning',
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge,
  };
}
