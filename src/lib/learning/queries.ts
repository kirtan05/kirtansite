/**
 * /learning — the queries.
 *
 * Kept in one place so that the kid/coach split is auditable: any function
 * whose name does not start with `coach` must be safe to run for the boy, and
 * in particular must never touch `problem_answer`.
 */
import { today, type IsoDate } from './dates';

export interface SessionRow {
  id: string;
  course_id: string;
  seq: number;
  title: string;
  kind: string;
  sheet_slug: string | null;
  notes: string | null;
  course_name: string;
}

export interface ProblemRow {
  id: string;
  ref: string;
  label: string | null;
  kind: string;
  parent_id: string | null;
  position: number;
}

export interface AttemptRow {
  id: string;
  problem_id: string;
  kid_mark: string | null;
  outcome: string | null;
  kind: string;
  voided_at: string | null;
  note: string | null;
}

export interface EntryRow {
  id: string;
  session_id: string;
  on_date: IsoDate;
  minutes: number | null;
  kid_note: string | null;
  favourite_problem_id: string | null;
  closed_at: string | null;
  verified_at: string | null;
  coach_note: string | null;
}

const SESSION_COLS = `s.id, s.course_id, s.seq, s.title, s.kind, s.sheet_slug, s.notes, c.name AS course_name`;

/**
 * The next session in a strand that has not been closed off.
 *
 * Strand-scoped on purpose. The two tracks advance independently — he can be
 * on Burago sheet 6 and computer rung 2 — and a single global "next session"
 * silently let the computer track's first rung outrank the maths sheet.
 */
export async function currentSession(db: D1Database, strand: 'math' | 'computer' = 'math'): Promise<SessionRow | null> {
  return db
    .prepare(
      `SELECT ${SESSION_COLS}
         FROM session s JOIN course c ON c.id = s.course_id
        WHERE c.active = 1 AND c.strand = ?
          AND s.id NOT IN (SELECT session_id FROM entry WHERE closed_at IS NOT NULL)
        ORDER BY s.seq LIMIT 1`,
    )
    .bind(strand)
    .first<SessionRow>();
}

export interface TaskRow {
  id: string;
  ref: string;
  title: string;
  kind: string;
  evidence_kind: string;
  position: number;
  state: string | null;
  evidence_upload_id: string | null;
}

/** The rungs of one computer session, with whatever state they are in. */
export async function tasksFor(db: D1Database, sessionId: string): Promise<TaskRow[]> {
  const r = await db
    .prepare(
      `SELECT t.id, t.ref, t.title, t.kind, t.evidence_kind, t.position,
              ts.state, ts.evidence_upload_id
         FROM task t LEFT JOIN task_state ts ON ts.task_id = t.id
        WHERE t.session_id = ? ORDER BY t.position`,
    )
    .bind(sessionId)
    .all<TaskRow>();
  return r.results ?? [];
}

/** Rungs he has said he climbed but nobody has confirmed. These are the ones
 *  that get quietly skipped, so they surface on the coach dashboard. */
export async function unconfirmedTasks(db: D1Database) {
  const r = await db
    .prepare(
      `SELECT t.id, t.ref, t.title, t.evidence_kind, ts.state, ts.on_date, ts.evidence_upload_id, s.title AS session_title
         FROM task_state ts
         JOIN task t ON t.id = ts.task_id
         JOIN session s ON s.id = t.session_id
        WHERE ts.state = 'claimed'
        ORDER BY ts.on_date LIMIT 20`,
    )
    .all();
  return r.results ?? [];
}

export async function sessionBySeq(db: D1Database, seq: number, strand = 'math'): Promise<SessionRow | null> {
  return db
    .prepare(
      `SELECT ${SESSION_COLS} FROM session s JOIN course c ON c.id = s.course_id
        WHERE s.seq = ? AND c.strand = ? LIMIT 1`,
    )
    .bind(seq, strand)
    .first<SessionRow>();
}

/** Problems for a sheet. No statements, no answers — both live elsewhere. */
export async function problemsFor(db: D1Database, sessionId: string): Promise<ProblemRow[]> {
  const r = await db
    .prepare(
      `SELECT id, ref, label, kind, parent_id, position
         FROM problem WHERE session_id = ? ORDER BY position, ref`,
    )
    .bind(sessionId)
    .all<ProblemRow>();
  return r.results ?? [];
}

export async function entryFor(db: D1Database, sessionId: string, onDate: IsoDate): Promise<EntryRow | null> {
  return db
    .prepare(`SELECT * FROM entry WHERE session_id = ? AND on_date = ?`)
    .bind(sessionId, onDate)
    .first<EntryRow>();
}

/** The open entry for a session, whatever date it was started on. An evening
 *  that runs past midnight, or is finished on Sunday, is still one evening. */
export async function openEntryFor(db: D1Database, sessionId: string): Promise<EntryRow | null> {
  return db
    .prepare(`SELECT * FROM entry WHERE session_id = ? AND closed_at IS NULL ORDER BY on_date DESC LIMIT 1`)
    .bind(sessionId)
    .first<EntryRow>();
}

export async function ensureEntry(db: D1Database, sessionId: string, onDate: IsoDate = today()): Promise<EntryRow> {
  const open = await openEntryFor(db, sessionId);
  if (open) return open;

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO entry (id, session_id, on_date, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, on_date) DO NOTHING`,
    )
    .bind(id, sessionId, onDate, new Date().toISOString())
    .run();

  return (await entryFor(db, sessionId, onDate))!;
}

export async function attemptsFor(db: D1Database, entryId: string): Promise<AttemptRow[]> {
  const r = await db
    .prepare(
      `SELECT id, problem_id, kid_mark, outcome, kind, voided_at, note
         FROM attempt WHERE entry_id = ?`,
    )
    .bind(entryId)
    .all<AttemptRow>();
  return r.results ?? [];
}

export interface OpenProblem {
  problem_id: string;
  ref: string;
  seq: number;
  title: string;
  since: IsoDate;
}

/** Carry-overs. Called "still alive" everywhere the boy can see it, because
 *  that is what his coach notes call them and because a list of debts is not
 *  something anyone opens twice. */
export async function openProblems(db: D1Database, limit = 30): Promise<OpenProblem[]> {
  const r = await db
    .prepare(
      `SELECT ps.problem_id, p.ref, s.seq, s.title, ps.since
         FROM problem_state ps
         JOIN problem p ON p.id = ps.problem_id
         JOIN session s ON s.id = p.session_id
        WHERE ps.state = 'open'
        ORDER BY s.seq, p.position LIMIT ?`,
    )
    .bind(limit)
    .all<OpenProblem>();
  return r.results ?? [];
}

export interface UploadRow {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
  kind: string;
  created_at: string;
  created_by: string;
}

export async function uploadsFor(db: D1Database, entryId: string): Promise<UploadRow[]> {
  const r = await db
    .prepare(
      `SELECT id, filename, mime, bytes, kind, created_at, created_by
         FROM upload WHERE entry_id = ? AND superseded_by IS NULL ORDER BY created_at`,
    )
    .bind(entryId)
    .all<UploadRow>();
  return r.results ?? [];
}

/** Re-tests that are due, as problems to slip onto this week's sheet. */
export async function dueRetests(db: D1Database, on: IsoDate = today(), limit = 10) {
  const r = await db
    .prepare(
      `SELECT r.id, r.problem_id, r.stage, r.due_on, p.ref, s.seq, s.title
         FROM retest r
         JOIN problem p ON p.id = r.problem_id
         JOIN session s ON s.id = p.session_id
        WHERE r.state = 'due' AND r.due_on <= ?
        ORDER BY r.due_on LIMIT ?`,
    )
    .bind(on, limit)
    .all<{ id: string; problem_id: string; stage: number; due_on: IsoDate; ref: string; seq: number; title: string }>();
  return r.results ?? [];
}

/** Everything that happened, newest first. Used by /learning/history. */
export async function historyRows(db: D1Database, limit = 100) {
  const r = await db
    .prepare(
      `SELECT e.id, e.on_date, e.minutes, e.closed_at, e.verified_at, e.kid_note,
              s.seq, s.title, s.sheet_slug,
              (SELECT COUNT(*) FROM attempt a WHERE a.entry_id = e.id AND a.voided_at IS NULL) AS attempts,
              (SELECT COUNT(*) FROM attempt a WHERE a.entry_id = e.id AND a.voided_at IS NULL
                 AND a.outcome IN ('solved_alone','solved_with_hint')) AS solved,
              (SELECT COUNT(*) FROM upload u WHERE u.entry_id = e.id AND u.superseded_by IS NULL) AS uploads
         FROM entry e JOIN session s ON s.id = e.session_id
        ORDER BY e.on_date DESC, s.seq DESC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return r.results ?? [];
}

export async function breaks(db: D1Database) {
  const r = await db.prepare(`SELECT id, start_on, end_on, reason FROM break_period ORDER BY start_on`).all<{
    id: string;
    start_on: IsoDate;
    end_on: IsoDate;
    reason: string;
  }>();
  return r.results ?? [];
}

// ───────────────────────────────────────────── coach-only from here down

/** Entries waiting to be graded, oldest first. */
export async function coachVerifyQueue(db: D1Database) {
  const r = await db
    .prepare(
      `SELECT e.id, e.on_date, e.closed_at, s.seq, s.title,
              (SELECT COUNT(*) FROM attempt a WHERE a.entry_id = e.id AND a.outcome IS NULL AND a.voided_at IS NULL) AS ungraded
         FROM entry e JOIN session s ON s.id = e.session_id
        WHERE e.verified_at IS NULL
        ORDER BY e.on_date LIMIT 20`,
    )
    .all();
  return r.results ?? [];
}

/** Problems plus their answers. Coach routes only. */
export async function coachProblemsFor(db: D1Database, sessionId: string) {
  const r = await db
    .prepare(
      `SELECT p.id, p.ref, p.label, p.kind, p.parent_id, p.position,
              pa.answer, pa.note,
              COALESCE(GROUP_CONCAT(t.name, ' · '), '') AS topics
         FROM problem p
         LEFT JOIN problem_answer pa ON pa.problem_id = p.id
         LEFT JOIN problem_topic pt ON pt.problem_id = p.id
         LEFT JOIN topic t ON t.id = pt.topic_id
        WHERE p.session_id = ?
        GROUP BY p.id
        ORDER BY p.position, p.ref`,
    )
    .bind(sessionId)
    .all<ProblemRow & { answer: string | null; note: string | null; topics: string }>();
  return r.results ?? [];
}
