/**
 * /learning — the derived layer.
 *
 * Everything here is a query over `attempt`. Nothing here is a measurement.
 *
 * The single most important rule in this file: with four or five data points,
 * "72% mastery" is noise wearing a lab coat. So no percentage is ever shown
 * below MIN_N observations; below it the honest output is the raw counts and
 * the word "too few". A dashboard that guesses confidently is worse than no
 * dashboard, because it will be believed.
 *
 * Second rule: `not_attempted` is not evidence. It means the evening ran out,
 * not that he could not do it, and it is excluded from every calculation here.
 */
import { type IsoDate, addDays, retestDue, today, weeksBetween } from './dates';

/** Below this many graded first attempts, a topic is reported as "too few". */
export const MIN_N = 6;

export type Outcome = 'solved_alone' | 'solved_with_hint' | 'stuck' | 'not_attempted';
export type AttemptKind = 'first' | 'carryover' | 'retest';
export type TopicState = 'strong' | 'shaky' | 'blocked' | 'stale' | 'too_few' | 'untouched';

export interface TopicRow {
  id: string;
  name: string;
  strand: string;
  first_alone: number;
  first_hint: number;
  first_stuck: number;
  retest_pass: number;
  retest_fail: number;
  blocked: number;
  last_seen: IsoDate | null;
}

export interface TopicView extends TopicRow {
  n_first: number;
  n_retest: number;
  state: TopicState;
  /** Human sentence for the dashboard. Never a bare percentage. */
  summary: string;
  weeks_since: number | null;
}

// ───────────────────────────────────────────────────────────── reading

const TOPIC_SIGNALS_SQL = `
  SELECT t.id, t.name, t.strand,
         SUM(CASE WHEN a.kind = 'first'  AND a.outcome = 'solved_alone'     THEN 1 ELSE 0 END) AS first_alone,
         SUM(CASE WHEN a.kind = 'first'  AND a.outcome = 'solved_with_hint' THEN 1 ELSE 0 END) AS first_hint,
         SUM(CASE WHEN a.kind = 'first'  AND a.outcome = 'stuck'            THEN 1 ELSE 0 END) AS first_stuck,
         SUM(CASE WHEN a.kind = 'retest' AND a.outcome IN ('solved_alone','solved_with_hint') THEN 1 ELSE 0 END) AS retest_pass,
         SUM(CASE WHEN a.kind = 'retest' AND a.outcome = 'stuck'            THEN 1 ELSE 0 END) AS retest_fail,
         MAX(e.on_date) AS last_seen
    FROM topic t
    LEFT JOIN problem_topic pt ON pt.topic_id = t.id
    LEFT JOIN attempt a ON a.problem_id = pt.problem_id
                       AND a.voided_at IS NULL
                       AND a.outcome IS NOT NULL
                       AND a.outcome <> 'not_attempted'
    LEFT JOIN entry e ON e.id = a.entry_id
   GROUP BY t.id
   ORDER BY t.sort, t.name`;

/** A problem is "blocked" once it has been genuinely attempted three times
 *  across two different evenings and is still not solved. Three tries in one
 *  sitting is a bad evening; three tries across three weeks is a wall. */
const BLOCKED_SQL = `
  SELECT pt.topic_id AS topic_id, COUNT(*) AS blocked
    FROM (SELECT p.id AS pid
            FROM problem p
            JOIN problem_state ps ON ps.problem_id = p.id AND ps.state = 'open'
            JOIN attempt a ON a.problem_id = p.id AND a.voided_at IS NULL AND a.outcome = 'stuck'
           GROUP BY p.id
          HAVING COUNT(a.id) >= 3 AND COUNT(DISTINCT a.entry_id) >= 2) b
    JOIN problem_topic pt ON pt.problem_id = b.pid
   GROUP BY pt.topic_id`;

export async function topicMap(db: D1Database, on: IsoDate = today()): Promise<TopicView[]> {
  const [signals, blocked] = await db.batch<any>([db.prepare(TOPIC_SIGNALS_SQL), db.prepare(BLOCKED_SQL)]);
  const blockedBy = new Map<string, number>(
    (blocked.results ?? []).map((r: any) => [r.topic_id, Number(r.blocked)]),
  );
  return (signals.results ?? []).map((r: any) =>
    classify({ ...r, blocked: blockedBy.get(r.id) ?? 0 } as TopicRow, on),
  );
}

export function classify(r: TopicRow, on: IsoDate = today()): TopicView {
  const n_first = r.first_alone + r.first_hint + r.first_stuck;
  const n_retest = r.retest_pass + r.retest_fail;
  const weeks_since = r.last_seen ? weeksBetween(r.last_seen, on) : null;

  let state: TopicState;
  let summary: string;

  if (n_first === 0 && n_retest === 0) {
    state = 'untouched';
    summary = 'not started';
  } else if (r.blocked > 0) {
    // A wall outranks everything else, however good the averages look.
    state = 'blocked';
    summary = `${r.blocked} problem${r.blocked === 1 ? '' : 's'} stuck across 2+ evenings`;
  } else if (n_first < MIN_N) {
    state = 'too_few';
    summary = `${r.first_alone} alone · ${r.first_hint} with a hint · ${r.first_stuck} stuck — too few to call`;
  } else if (n_retest > 0 && r.retest_fail > r.retest_pass) {
    // Forgetting outranks a good first-pass rate. That is the whole point of
    // running re-tests at all.
    state = 'shaky';
    summary = `re-tests: ${r.retest_pass} of ${n_retest} came back`;
  } else if (weeks_since !== null && weeks_since >= 8) {
    state = 'stale';
    summary = `${r.first_alone} of ${n_first} alone, but untouched for ${weeks_since} weeks`;
  } else if (r.first_alone >= r.first_hint + r.first_stuck && (n_retest === 0 || r.retest_pass >= n_retest - 1)) {
    state = 'strong';
    summary = `${r.first_alone} of ${n_first} alone${n_retest ? ` · ${r.retest_pass}/${n_retest} on re-test` : ''}`;
  } else {
    state = 'shaky';
    summary = `${r.first_alone} of ${n_first} alone, ${r.first_hint} needed a hint`;
  }

  return { ...r, n_first, n_retest, state, summary, weeks_since };
}

// ───────────────────────────────────────────────────────────── writing

export interface GradeInput {
  db: D1Database;
  attemptId: string;
  problemId: string;
  outcome: Outcome;
  kind: AttemptKind;
  onDate: IsoDate;
}

/**
 * Apply one grade and all of its consequences.
 *
 * The consequences are the reason the coach only ever types one thing:
 *  - solved            -> the problem closes, and joins the re-test ladder
 *  - solved on re-test -> the ladder advances (3wk -> 10wk -> 6mo)
 *  - FAILED re-test    -> the problem re-opens AND is re-queued from the start.
 *                         Without that last clause a forgotten item is noticed
 *                         once and then never asked about again, which is
 *                         precisely backwards.
 *  - stuck             -> stays open; it is a carry-over, not a failure
 *  - not attempted     -> nothing at all changes. It is not evidence.
 */
export async function applyGrade({ db, attemptId, problemId, outcome, kind, onDate }: GradeInput): Promise<void> {
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE attempt SET outcome = ?, graded_at = ? WHERE id = ?').bind(outcome, now, attemptId),
  ];

  if (outcome === 'not_attempted') {
    await db.batch(stmts);
    return;
  }

  const solved = outcome === 'solved_alone' || outcome === 'solved_with_hint';

  stmts.push(
    db
      .prepare(
        `INSERT INTO problem_state (problem_id, state, since, reason) VALUES (?, ?, ?, ?)
         ON CONFLICT(problem_id) DO UPDATE SET state = excluded.state, since = excluded.since, reason = excluded.reason`,
      )
      .bind(problemId, solved ? 'solved' : 'open', onDate, kind === 'retest' && !solved ? 'failed re-test' : null),
  );

  if (kind === 'retest') {
    const open = await db
      .prepare(`SELECT id, stage FROM retest WHERE problem_id = ? AND state = 'due' ORDER BY due_on LIMIT 1`)
      .bind(problemId)
      .first<{ id: string; stage: number }>();

    if (open) {
      stmts.push(
        db
          .prepare('UPDATE retest SET state = ?, resolved_attempt_id = ?, resolved_on = ? WHERE id = ?')
          .bind(solved ? 'done' : 'failed', attemptId, onDate, open.id),
      );
    }

    const nextStage = solved ? (open?.stage ?? 0) + 1 : 0;
    // A pass at the last stage ends the ladder; a failure always restarts it.
    if (!solved || nextStage < 3) {
      stmts.push(newRetest(db, problemId, retestDue(onDate, nextStage), nextStage, attemptId, now));
    }
  } else if (solved) {
    // First time it has been solved: start the ladder, unless one is running.
    const running = await db
      .prepare(`SELECT id FROM retest WHERE problem_id = ? AND state = 'due' LIMIT 1`)
      .bind(problemId)
      .first<{ id: string }>();
    if (!running) stmts.push(newRetest(db, problemId, retestDue(onDate, 0), 0, attemptId, now));
  }

  await db.batch(stmts);
}

function newRetest(
  db: D1Database,
  problemId: string,
  due: IsoDate,
  stage: number,
  fromAttempt: string,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO retest (id, problem_id, due_on, stage, state, created_from_attempt_id, created_at)
       VALUES (?, ?, ?, ?, 'due', ?, ?)`,
    )
    .bind(crypto.randomUUID(), problemId, due, stage, fromAttempt, now);
}

// ───────────────────────────────────────────────────────── the brief

export interface Brief {
  on: IsoDate;
  nextSession: { seq: number; title: string; sheet_slug: string | null; on_date: IsoDate | null } | null;
  carryovers: Array<{ problem_id: string; ref: string; seq: number; since: IsoDate; weeks: number }>;
  retests: Array<{ problem_id: string; ref: string; seq: number; due_on: IsoDate; stage: number; topics: string }>;
  watch: TopicView[];
  lastGraded: IsoDate | null;
  ungraded: number;
  typing: { latest: number | null; delta: number | null; weeks: number | null };
  onBreak: string | null;
}

/**
 * The weekly brief. This is the actual product; everything else is
 * infrastructure for producing it.
 */
export async function weeklyBrief(db: D1Database, on: IsoDate = today()): Promise<Brief> {
  const soon = addDays(on, 7);

  const [next, carry, due, lastGraded, ungraded, typing, brk] = await db.batch<any>([
    // Maths only. The computer ladder advances on its own clock and has its
    // own section; letting it into this query made rung 1 outrank sheet 2.
    db.prepare(
      `SELECT s.seq, s.title, s.sheet_slug, p.on_date
         FROM session s
         JOIN course c ON c.id = s.course_id AND c.strand = 'math'
         LEFT JOIN planned p ON p.session_id = s.id AND p.state = 'planned'
        WHERE s.id NOT IN (SELECT session_id FROM entry WHERE closed_at IS NOT NULL)
        ORDER BY s.seq LIMIT 1`,
    ),
    db.prepare(
      `SELECT ps.problem_id, p.ref, s.seq, ps.since
         FROM problem_state ps
         JOIN problem p ON p.id = ps.problem_id
         JOIN session s ON s.id = p.session_id
        WHERE ps.state = 'open'
        ORDER BY ps.since LIMIT 20`,
    ),
    db.prepare(
      `SELECT r.problem_id, p.ref, s.seq, r.due_on, r.stage,
              COALESCE(GROUP_CONCAT(t.name, ', '), '') AS topics
         FROM retest r
         JOIN problem p ON p.id = r.problem_id
         JOIN session s ON s.id = p.session_id
         LEFT JOIN problem_topic pt ON pt.problem_id = p.id
         LEFT JOIN topic t ON t.id = pt.topic_id
        WHERE r.state = 'due' AND r.due_on <= ?
        GROUP BY r.id
        ORDER BY r.due_on LIMIT 10`,
    ).bind(soon),
    db.prepare(`SELECT MAX(on_date) AS d FROM entry WHERE verified_at IS NOT NULL`),
    db.prepare(`SELECT COUNT(*) AS n FROM entry WHERE closed_at IS NOT NULL AND verified_at IS NULL`),
    db.prepare(
      `SELECT on_date, value FROM measurement WHERE metric = 'typing_wpm' ORDER BY on_date DESC LIMIT 6`,
    ),
    db.prepare(`SELECT reason FROM break_period WHERE start_on <= ? AND end_on >= ? LIMIT 1`).bind(on, on),
  ]);

  const typingRows: Array<{ on_date: IsoDate; value: number }> = typing.results ?? [];
  const latest = typingRows[0] ?? null;
  const oldest = typingRows[typingRows.length - 1] ?? null;

  return {
    on,
    nextSession: next.results?.[0] ?? null,
    carryovers: (carry.results ?? []).map((r: any) => ({ ...r, weeks: weeksBetween(r.since, on) })),
    retests: due.results ?? [],
    watch: (await topicMap(db, on)).filter((t) => t.state === 'shaky' || t.state === 'blocked' || t.state === 'stale'),
    lastGraded: lastGraded.results?.[0]?.d ?? null,
    ungraded: Number(ungraded.results?.[0]?.n ?? 0),
    typing: {
      latest: latest ? latest.value : null,
      delta: latest && oldest && latest !== oldest ? Math.round((latest.value - oldest.value) * 10) / 10 : null,
      weeks: latest && oldest && latest !== oldest ? weeksBetween(oldest.on_date, latest.on_date) : null,
    },
    onBreak: brk.results?.[0]?.reason ?? null,
  };
}

/**
 * Cumulative, monotonic counts for his screen.
 *
 * These can only ever go up. That is the entire design constraint: his screen
 * showed him only what he owed, which is a debt ledger, not a record of work.
 * Streaks are deliberately absent — a completion-contingent reward that breaks
 * the first time life interrupts is exactly the wrong mechanic for something
 * meant to last three years.
 */
export async function kidTotals(db: D1Database): Promise<{
  cracked: number;
  alone: number;
  evenings: number;
  stillAlive: number;
  uploads: number;
}> {
  const [cracked, evenings, alive, uploads] = await db.batch<any>([
    db.prepare(
      `SELECT COUNT(DISTINCT problem_id) AS n,
              COUNT(DISTINCT CASE WHEN outcome = 'solved_alone' THEN problem_id END) AS alone
         FROM attempt
        WHERE voided_at IS NULL AND outcome IN ('solved_alone','solved_with_hint')`,
    ),
    db.prepare(`SELECT COUNT(*) AS n FROM entry WHERE closed_at IS NOT NULL`),
    db.prepare(`SELECT COUNT(*) AS n FROM problem_state WHERE state = 'open'`),
    db.prepare(`SELECT COUNT(*) AS n FROM upload WHERE superseded_by IS NULL`),
  ]);

  return {
    cracked: Number(cracked.results?.[0]?.n ?? 0),
    alone: Number(cracked.results?.[0]?.alone ?? 0),
    evenings: Number(evenings.results?.[0]?.n ?? 0),
    stillAlive: Number(alive.results?.[0]?.n ?? 0),
    uploads: Number(uploads.results?.[0]?.n ?? 0),
  };
}
