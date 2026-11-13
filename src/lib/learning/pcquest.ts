/**
 * PC Quest — pure logic shared by the /learning/api/pcquest routes and the
 * coach card. No I/O here, so it can be unit-tested without a database (see
 * src/scripts/pcquest/pcquest.test.ts).
 *
 * PC Quest is the Windows app that gives Monit hands-on computer tasks and
 * checks on the machine that he did them. Its spec lives in the learning repo:
 * pcquest/docs/TASK-FORMAT.md (§10 is the sync protocol this implements).
 *
 * Everything the laptop sends is a claim. The laptop's clock can be wrong and
 * the kid token sits on the laptop, so validation bounds what a bad client can
 * do (≤ 50 events a request, timestamps clamped, known kinds only) rather than
 * trying to prove anything.
 */

export const EVENT_KINDS = [
  'start',
  'step',
  'done',
  'hint',
  'pointed',
  'point_miss',
  'wrong',
  'reset',
  'blocked_caps',
  'bad_sig',
  'heartbeat',
] as const;
export type PqKind = (typeof EVENT_KINDS)[number];

export const MAX_EVENTS = 50;
const FUTURE_MS = 1 * 86_400_000;
const MAX_DETAIL_CHARS = 2000;

/** A validated event, ready to insert. `detail` is stored as JSON text. */
export interface CleanPqEvent {
  id: string;
  at: string; // ISO UTC, normalised (clamped to `now` only if more than a day in the future)
  kind: PqKind;
  task: string | null;
  rev: number | null;
  step: string | null;
  detail: Record<string, unknown> | null;
}

/** An event the server would not store, and why. `id` is null when it had none. */
export interface RejectedEvent {
  index: number;
  id: string | null;
  reason: string;
}

export interface CleanBatch {
  device_id: string;
  device: string | null; // label for humans; null when not sent (the stored label is kept)
  app_version: string | null;
  events: CleanPqEvent[];
  rejected: RejectedEvent[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const optStr = (v: unknown, max: number): string | null | undefined =>
  v == null ? null : typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;

/** One event: the clean form, or the reason it is refused. */
function validateEvent(r: unknown, nowMs: number): CleanPqEvent | string {
  if (!isObj(r)) return 'not an object';
  if (typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 128) return 'bad id';
  if (typeof r.kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(r.kind)) return 'unknown kind';
  const task = optStr(r.task, 128);
  if (task === undefined) return 'bad task';
  const step = optStr(r.step, 64);
  if (step === undefined) return 'bad step';
  if (r.rev != null && !Number.isInteger(r.rev)) return 'bad rev';
  if (r.detail != null && !isObj(r.detail)) return 'detail must be an object';
  let detail = r.detail == null ? null : { ...(r.detail as Record<string, unknown>) };
  if (detail && JSON.stringify(detail).length > MAX_DETAIL_CHARS) return 'detail too large';

  const t = typeof r.at === 'string' ? Date.parse(r.at) : NaN;
  if (Number.isNaN(t)) return 'bad at';
  let at = new Date(t).toISOString();
  // Any past time is believed (a laptop can be offline for months). Only a
  // clock running more than a day fast is pulled back to the server's now.
  if (t > nowMs + FUTURE_MS) {
    at = new Date(nowMs).toISOString();
    detail = { ...(detail ?? {}), clamped: true };
  }
  return { id: r.id, at, kind: r.kind as PqKind, task, rev: (r.rev as number | null) ?? null, step, detail };
}

/**
 * Validate a POST /events body. A structurally bad body (not an object, no
 * device_id, events not an array, more than 50 events) is an error string,
 * which the route turns into a 400. Otherwise each event stands alone: the
 * valid ones are returned in `events`, the rest in `rejected` with a reason,
 * so one event a newer app knows and this server doesn't can never wedge the
 * laptop's outbox.
 */
export function validateEvents(body: unknown, now: Date): CleanBatch | string {
  if (!isObj(body)) return 'body must be a JSON object';
  const device_id = body.device_id;
  if (typeof device_id !== 'string' || device_id.length < 8 || device_id.length > 128) return 'missing device_id';
  const device = typeof body.device === 'string' && body.device ? body.device.slice(0, 64) : null;
  const app_version = typeof body.app_version === 'string' ? body.app_version.slice(0, 32) : null;

  if (!Array.isArray(body.events)) return 'events must be an array';
  if (body.events.length > MAX_EVENTS) return `too many events; send at most ${MAX_EVENTS}`;

  const nowMs = now.getTime();
  const events: CleanPqEvent[] = [];
  const rejected: RejectedEvent[] = [];
  for (const [index, r] of body.events.entries()) {
    const c = validateEvent(r, nowMs);
    if (typeof c === 'string') {
      const id = isObj(r) && typeof r.id === 'string' ? r.id.slice(0, 128) : null;
      rejected.push({ index, id, reason: c });
    } else events.push(c);
  }
  return { device_id, device, app_version, events, rejected };
}

// ── progress ───────────────────────────────────────────────────────────

export interface StepRecord {
  at: string;
  selfReported: boolean;
  pointed: boolean;
}

export interface TaskProgress {
  state: 'in_progress' | 'done';
  rev: number | null;
  startedAt: string;
  doneAt: string | null;
  steps: Record<string, StepRecord>;
  hints: number;
  wrong: number;
}

export type Progress = Record<string, TaskProgress>;

/**
 * Fold the event log into per-task progress. Events are applied in `at`
 * order (stable for ties). A `reset` drops everything before it for that
 * task; a later `start` begins a fresh attempt. Events without a task, and
 * kinds that say nothing about progress (heartbeat, blocked_caps, bad_sig,
 * point_miss), are ignored.
 */
export function foldProgress(events: CleanPqEvent[]): Progress {
  const out: Progress = {};
  // Steps pointed at before they passed: task -> step ids.
  const pending = new Map<string, Set<string>>();
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  for (const e of sorted) {
    const id = e.task;
    if (!id) continue;
    if (e.kind === 'reset') {
      delete out[id];
      pending.delete(id);
      continue;
    }
    if (!['start', 'step', 'done', 'hint', 'pointed', 'wrong'].includes(e.kind)) continue;

    const p = (out[id] ??= { state: 'in_progress', rev: null, startedAt: e.at, doneAt: null, steps: {}, hints: 0, wrong: 0 });
    if (e.rev != null) p.rev = e.rev;

    switch (e.kind) {
      case 'done':
        p.state = 'done';
        p.doneAt ??= e.at;
        break;
      case 'hint':
        p.hints++;
        break;
      case 'wrong':
        p.wrong++;
        break;
      case 'pointed':
        if (!e.step) break;
        if (p.steps[e.step]) p.steps[e.step].pointed = true;
        else {
          if (!pending.has(id)) pending.set(id, new Set());
          pending.get(id)!.add(e.step);
        }
        break;
      case 'step':
        // A passed step stays passed (spec §3): keep the first pass.
        if (!e.step || p.steps[e.step]) break;
        p.steps[e.step] = {
          at: e.at,
          selfReported: e.detail?.selfReported === true,
          pointed: pending.get(id)?.has(e.step) ?? false,
        };
        break;
    }
  }
  return out;
}

// ── packs ──────────────────────────────────────────────────────────────

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * True when `wire` ({"payload": "<pack JSON>", "sig": "<base64>"}) carries an
 * ECDSA P-256 / SHA-256 signature, IEEE-P1363 (r‖s) form, over the UTF-8
 * bytes of `payload`, by the key whose SPKI is `spkiB64`. Never throws.
 */
export async function verifyPackSig(wire: string, spkiB64: string): Promise<boolean> {
  try {
    const w = JSON.parse(wire);
    if (!isObj(w) || typeof w.payload !== 'string' || typeof w.sig !== 'string') return false;
    const key = await crypto.subtle.importKey(
      'spki',
      b64ToBytes(spkiB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64ToBytes(w.sig),
      new TextEncoder().encode(w.payload),
    );
  } catch {
    return false;
  }
}

export interface TaskMeta {
  id: string;
  title?: string;
  rung?: string;
  chapter?: string;
  retired?: boolean;
  /** Step ids whose check is a `parent` check (needs `quest approve`). */
  parentSteps?: string[];
}

/**
 * The tasks a pack payload declares. Assumes the compiled payload is
 * `{ pack, format, ..., tasks: [{ id, title, rung, chapter, retired, steps: [{ id, check }] }] }`.
 * Anything missing or malformed is skipped, never thrown.
 */
export function tasksFromPayload(payload: string): TaskMeta[] {
  try {
    const p = JSON.parse(payload);
    if (!isObj(p) || !Array.isArray(p.tasks)) return [];
    return p.tasks.filter(isObj).filter((t) => typeof t.id === 'string').map((t) => ({
      id: t.id as string,
      title: typeof t.title === 'string' ? t.title : undefined,
      rung: typeof t.rung === 'string' ? t.rung : undefined,
      chapter: typeof t.chapter === 'string' ? t.chapter : undefined,
      retired: t.retired === true,
      parentSteps: (Array.isArray(t.steps) ? t.steps : [])
        .filter((s: unknown) => isObj(s) && isObj(s.check) && s.check.type === 'parent' && typeof s.id === 'string')
        .map((s: any) => s.id as string),
    }));
  } catch {
    return [];
  }
}

/**
 * Per curriculum rung: tasks done, tasks available, and how many of the done
 * ones rest on at least one self-reported step. Retired tasks count only if
 * he finished them (so `done` never exceeds `total`). Tasks without a rung
 * are left out. Sorted C1, C2, …, C10.
 */
export function rungSummary(
  progress: Progress,
  taskMeta: TaskMeta[],
): Array<{ rung: string; done: number; total: number; selfReported: number }> {
  const by = new Map<string, { rung: string; done: number; total: number; selfReported: number }>();
  for (const t of taskMeta) {
    if (!t.rung) continue;
    const p = progress[t.id];
    const isDone = p?.state === 'done';
    if (t.retired && !isDone) continue;
    const row = by.get(t.rung) ?? { rung: t.rung, done: 0, total: 0, selfReported: 0 };
    row.total++;
    if (isDone) {
      row.done++;
      if (Object.values(p.steps).some((s) => s.selfReported)) row.selfReported++;
    }
    by.set(t.rung, row);
  }
  return [...by.values()].sort((a, b) => a.rung.localeCompare(b.rung, 'en', { numeric: true }));
}

/** In-progress tasks stuck on a `parent` step that has not been approved. */
export function waitingApprovals(progress: Progress, taskMeta: TaskMeta[], approved: Set<string>): TaskMeta[] {
  return taskMeta.filter((t) => {
    const p = progress[t.id];
    if (!p || p.state === 'done' || approved.has(t.id)) return false;
    return (t.parentSteps ?? []).some((s) => !p.steps[s]);
  });
}

// ── pack upload limits ─────────────────────────────────────────────────

export const MAX_WIRE_BYTES = 1_500_000; // D1 caps a row at 2 MB
export const MAX_ASSETS = 20;
export const MAX_ASSET_BYTES = 1_000_000;

/** Base64 to bytes, using the fastest decoder the runtime has. Null if invalid. */
export function b64Decode(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 === 1) return null;
  try {
    const U8 = Uint8Array as any;
    if (typeof U8.fromBase64 === 'function') return U8.fromBase64(b64);
    const B = (globalThis as any).Buffer;
    if (B) return new Uint8Array(B.from(b64, 'base64'));
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export interface PackPut {
  wire: string;
  assets: Array<{ path: string; bytes: Uint8Array }>;
}

/**
 * Check a PUT /packs/:id body against the size limits, before any crypto.
 * Returns the decoded body, or an error string (a 400). The signature and the
 * payload's `pack` are checked separately.
 */
export function validatePackPut(body: unknown): PackPut | string {
  if (!isObj(body) || typeof body.wire !== 'string') return 'missing wire';
  if (new TextEncoder().encode(body.wire).length > MAX_WIRE_BYTES) return `wire larger than ${MAX_WIRE_BYTES} bytes`;
  const raw = body.assets == null ? [] : body.assets;
  if (!Array.isArray(raw)) return 'assets must be an array';
  if (raw.length > MAX_ASSETS) return `too many assets; at most ${MAX_ASSETS}`;

  const assets: PackPut['assets'] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    if (!isObj(a) || typeof a.path !== 'string' || !a.path || a.path.length > 200 || typeof a.b64 !== 'string') {
      return 'bad asset';
    }
    if (seen.has(a.path)) return `asset ${a.path}: duplicate path`;
    seen.add(a.path);
    // Refuse oversize before decoding: base64 is 4 chars per 3 bytes.
    if (Math.floor((a.b64.length * 3) / 4) - 2 > MAX_ASSET_BYTES) return `asset ${a.path}: larger than ${MAX_ASSET_BYTES} bytes`;
    const bytes = b64Decode(a.b64);
    if (!bytes) return `asset ${a.path}: bad base64`;
    if (bytes.length > MAX_ASSET_BYTES) return `asset ${a.path}: larger than ${MAX_ASSET_BYTES} bytes`;
    assets.push({ path: a.path, bytes });
  }
  return { wire: body.wire, assets };
}

/** True when `spkiB64` imports as a P-256 public key (so not the placeholder). */
export async function pubkeyUsable(spkiB64: string | undefined): Promise<boolean> {
  if (!spkiB64) return false;
  try {
    await crypto.subtle.importKey('spki', b64ToBytes(spkiB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return true;
  } catch {
    return false;
  }
}

/** Split a list into runs of at most n (D1 batches stay under the statement budget). */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── heartbeat retention (spec §10) ─────────────────────────────────────

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

/** One heartbeat row per device per IST day; this is its primary key. */
export function heartbeatId(deviceId: string, at: string): string {
  return `hb|${deviceId}|${DAY_FMT.format(new Date(at))}`;
}
