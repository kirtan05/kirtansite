/**
 * PC Quest — the reads shared by the sync and progress routes and the coach
 * card. The logic lives in pcquest.ts; this file only fetches rows.
 */
import {
  ISSUE_KINDS,
  foldProgress,
  summariseIssues,
  rungSummary,
  tasksFromPayload,
  waitingApprovals,
  type CleanPqEvent,
  type Progress,
  type TaskMeta,
} from './pcquest';

/** Kinds that can change progress; the rest never need reading back. */
const PROGRESS_KINDS = "('start','step','done','hint','pointed','wrong','reset')";

/**
 * Fold every progress event. Heartbeats and the other kinds that never change
 * progress are not read at all, and `detail` is only fetched for `step`
 * and `start` events (the only places the fold looks at it). Order is at, then arrival,
 * then insertion, so ties are deterministic. Incremental folding is parked:
 * one learner, small volume.
 */
export async function loadProgress(db: D1Database): Promise<Progress> {
  const rows = ((
    await db
      .prepare(
        `SELECT at, kind, task, rev, step, CASE WHEN kind IN ('step', 'start') THEN detail END AS detail FROM pq_event
          WHERE task IS NOT NULL AND kind IN ${PROGRESS_KINDS} ORDER BY at, received_at, rowid`,
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
    return { id: '', at: r.at, kind: r.kind, task: r.task, rev: r.rev, step: r.step, detail };
  });
  return foldProgress(events);
}

/**
 * blocked_caps / point_miss / bad_sig from the last 30 days (by arrival, which
 * is indexed), collapsed per kind+task+rev+step. Bounded: at most 500 rows read.
 */
export async function loadIssues(db: D1Database) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const kinds = ISSUE_KINDS.map((k) => `'${k}'`).join(', ');
  const rows = ((
    await db
      .prepare(
        `SELECT at, kind, task, rev, step, detail FROM pq_event
          WHERE received_at >= ? AND kind IN (${kinds}) ORDER BY received_at DESC LIMIT 500`,
      )
      .bind(since)
      .all<any>()
  ).results ?? []) as any[];
  return summariseIssues(
    rows.map((r) => {
      let detail = null;
      try {
        detail = r.detail ? JSON.parse(r.detail) : null;
      } catch {
        /* a bad detail is just no detail */
      }
      return { id: '', at: r.at, kind: r.kind, task: r.task, rev: r.rev, step: r.step, detail };
    }),
  );
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
/** The helper agent's recent decisions and its last run. Empty if its tables don't exist yet. */
export async function loadAgent(db: D1Database) {
  try {
    const [log, state, summary] = await Promise.all([
      db.prepare('SELECT at, task, action, steps, reason FROM pq_agent_log ORDER BY id DESC LIMIT 20').all(),
      db.prepare("SELECT value FROM pq_agent_state WHERE key = 'last_run'").first<{ value: string }>(),
      db.prepare("SELECT value FROM pq_agent_state WHERE key = 'summary'").first<{ value: string }>(),
    ]);
    return {
      log: (log.results ?? []) as Array<{ at: string; task: string | null; action: string; steps: string | null; reason: string }>,
      lastRun: state ? (JSON.parse(state.value) as { at: string; laptopOnline: boolean; open: number; note: string | null }) : null,
      summary: summary ? (JSON.parse(summary.value) as { at: string; text: string }) : null,
    };
  } catch {
    return { log: [], lastRun: null, summary: null };
  }
}

export async function coachView(db: D1Database) {
  const [packs, progress, approvals, resets, devices, app, issues, agent] = await Promise.all([
    loadPacks(db, true),
    loadProgress(db),
    loadApprovals(db),
    loadResets(db),
    loadDevices(db),
    latestRelease(db),
    loadIssues(db),
    loadAgent(db),
  ]);
  const meta = taskMetaOf(packs);
  return {
    agent,
    packs,
    meta,
    progress,
    approvals,
    resets,
    devices,
    app,
    issues,
    rungs: rungSummary(progress, meta),
    waiting: waitingApprovals(progress, meta, new Set(approvals.map((a) => a.task))),
  };
}
