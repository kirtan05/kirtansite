/**
 * PC Quest — the reads shared by the sync and progress routes and the coach
 * card. The logic lives in pcquest.ts; this file only fetches rows.
 */
import {
  foldProgress,
  rungSummary,
  tasksFromPayload,
  waitingApprovals,
  type CleanPqEvent,
  type Progress,
  type TaskMeta,
} from './pcquest';

/** Kinds that can change progress; the rest never need reading back. */
const PROGRESS_KINDS = "('start','step','done','hint','pointed','wrong','reset')";

export async function loadProgress(db: D1Database): Promise<Progress> {
  const rows = ((
    await db
      .prepare(
        `SELECT id, at, kind, task, rev, step, detail FROM pq_event
          WHERE task IS NOT NULL AND kind IN ${PROGRESS_KINDS} ORDER BY at, received_at`,
      )
      .all<any>()
  ).results ?? []) as any[];
  const events: CleanPqEvent[] = rows.map((r) => {
    let detail = null;
    try {
      detail = r.detail ? JSON.parse(r.detail) : null;
    } catch {
      /* a bad detail is just no detail */
    }
    return { id: r.id, at: r.at, kind: r.kind, task: r.task, rev: r.rev, step: r.step, detail };
  });
  return foldProgress(events);
}

export interface PackRow {
  id: string;
  wire: string;
  version: number;
  updated_at: string;
  retired: number;
}

export async function loadPacks(db: D1Database, includeRetired: boolean): Promise<PackRow[]> {
  const sql = `SELECT id, wire, version, updated_at, retired FROM pq_pack ${includeRetired ? '' : 'WHERE retired = 0'} ORDER BY id`;
  return ((await db.prepare(sql).all<PackRow>()).results ?? []) as PackRow[];
}

/** The signed payload of a stored wire, parsed. Null if unreadable. */
export function payloadOf(wire: string): any | null {
  try {
    return JSON.parse(JSON.parse(wire).payload);
  } catch {
    return null;
  }
}

/** Every task in every pack. A task in a retired pack counts as retired. */
export function taskMetaOf(packs: PackRow[]): TaskMeta[] {
  return packs.flatMap((p) => {
    let payload = '';
    try {
      payload = JSON.parse(p.wire).payload;
    } catch {
      return [];
    }
    return tasksFromPayload(payload).map((t) => (p.retired ? { ...t, retired: true } : t));
  });
}

export async function loadApprovals(db: D1Database) {
  return ((await db.prepare('SELECT task, at, note FROM pq_approval ORDER BY at').all()).results ?? []) as Array<{
    task: string;
    at: string;
    note: string | null;
  }>;
}

export async function loadResets(db: D1Database) {
  return ((await db.prepare('SELECT task, at FROM pq_reset ORDER BY at').all()).results ?? []) as Array<{
    task: string;
    at: string;
  }>;
}

export async function loadDevices(db: D1Database) {
  return ((await db
    .prepare('SELECT id, label, app_version, first_seen, last_seen FROM pq_device ORDER BY last_seen DESC')
    .all()).results ?? []) as Array<{ id: string; label: string; app_version: string | null; first_seen: string; last_seen: string }>;
}

/** The newest announced app release, in the shape the sync response uses. */
export async function latestRelease(db: D1Database): Promise<{ latest: string; url: string; sha256: string } | null> {
  const r = await db
    .prepare('SELECT version, url, sha256 FROM pq_release ORDER BY at DESC LIMIT 1')
    .first<{ version: string; url: string; sha256: string }>();
  return r ? { latest: r.version, url: r.url, sha256: r.sha256 } : null;
}

/** Retire a pack: hidden from sync, history kept. False if there is no such pack. */
export async function retirePack(db: D1Database, id: string): Promise<boolean> {
  const r = await db
    .prepare('UPDATE pq_pack SET retired = 1, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Everything the coach-facing views need, in one go. */
export async function coachView(db: D1Database) {
  const [packs, progress, approvals, resets, devices, app] = await Promise.all([
    loadPacks(db, true),
    loadProgress(db),
    loadApprovals(db),
    loadResets(db),
    loadDevices(db),
    latestRelease(db),
  ]);
  const meta = taskMetaOf(packs);
  return {
    packs,
    meta,
    progress,
    approvals,
    resets,
    devices,
    app,
    rungs: rungSummary(progress, meta),
    waiting: waitingApprovals(progress, meta, new Set(approvals.map((a) => a.task))),
  };
}
