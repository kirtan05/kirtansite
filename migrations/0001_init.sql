-- /learning — initial schema
--
-- Shape notes, because several of these tables exist in reaction to a specific
-- review finding rather than to an obvious modelling need:
--
--  * course > session > problem > part.  The spine is three deep, not flat: a
--    sub-part ("1b") is its own row with parent_id set, because both Burago and
--    ZIO are graded per sub-part and a per-problem grain silently loses that.
--  * problem carries NO statement and NO answer.  Statements live in the repo
--    sheets (which is where they are authored and printed from); answers live
--    in problem_answer, a separate table that kid-role queries never touch, so
--    role separation holds at the query layer and not only in the templates.
--  * attempt holds the boy's claim and the coach's record in DIFFERENT columns.
--    The screens promise "his marks are claims, yours are the record"; one
--    outcome column would have made the coach overwrite the single most
--    interesting disagreement in the dataset.
--  * problem_state, not attempt, owns carry-over and retirement.  An attempt is
--    an event; "still open" is a fact about the problem that outlives any entry.
--  * break_period exists so that a fortnight of exams reads as a break rather
--    than as failure.  Nothing in the engine may treat a break as a gap.
--
-- Dates are TEXT 'YYYY-MM-DD'.  Timestamps are TEXT ISO-8601 in UTC.
-- Booleans are INTEGER 0/1.  Every id is a TEXT uuid unless stated otherwise.

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────── the spine

CREATE TABLE course (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  strand      TEXT NOT NULL CHECK (strand IN ('math', 'computer')),
  source      TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE session (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  title       TEXT NOT NULL,
  -- olympiad and game sessions are not problem sets and must not be scored as
  -- though they were; three of Burago's 29 have no problem set at all.
  kind        TEXT NOT NULL DEFAULT 'problem_set'
              CHECK (kind IN ('problem_set', 'olympiad', 'game', 'discussion', 'computer')),
  sheet_slug  TEXT,           -- e.g. 'S02' -> S02-Sheet2-STUDENT.pdf in the repo
  notes       TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (course_id, seq)
);

CREATE TABLE problem (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES problem(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL,   -- '1', '1b', 'W2', 'X3'
  label       TEXT,            -- short human tag for the grade queue
  kind        TEXT NOT NULL DEFAULT 'problem'
              CHECK (kind IN ('warmup', 'problem', 'starred', 'part', 'extra')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  UNIQUE (session_id, ref)
);
CREATE INDEX problem_by_session ON problem(session_id, position);
CREATE INDEX problem_by_parent  ON problem(parent_id);

-- Answers live apart from problems so that no kid-role query can reach them.
CREATE TABLE problem_answer (
  problem_id  TEXT PRIMARY KEY REFERENCES problem(id) ON DELETE CASCADE,
  answer      TEXT,
  note        TEXT
);

CREATE TABLE topic (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  strand  TEXT NOT NULL CHECK (strand IN ('math', 'computer')),
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE problem_topic (
  problem_id  TEXT NOT NULL REFERENCES problem(id) ON DELETE CASCADE,
  topic_id    TEXT NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, topic_id)
);
CREATE INDEX problem_topic_by_topic ON problem_topic(topic_id);

-- The computer track is drills, builds and concepts — not problems with
-- answers — so it gets its own table rather than being forced into `problem`.
CREATE TABLE task (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  ref            TEXT NOT NULL,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('drill', 'build', 'concept')),
  evidence_kind  TEXT NOT NULL DEFAULT 'screenshot'
                 CHECK (evidence_kind IN ('screenshot', 'file', 'photo', 'measurement', 'none')),
  position       INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  UNIQUE (session_id, ref)
);

-- ─────────────────────────────────────────────────────── the calendar

CREATE TABLE planned (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  on_date       TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'planned'
                CHECK (state IN ('planned', 'done', 'moved', 'skipped')),
  moved_reason  TEXT,
  UNIQUE (session_id, on_date)
);
CREATE INDEX planned_by_date ON planned(on_date);

-- A declared break is not a missed week.  Nothing derived may score it as one.
CREATE TABLE break_period (
  id        TEXT PRIMARY KEY,
  start_on  TEXT NOT NULL,
  end_on    TEXT NOT NULL,
  reason    TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────── what happened

CREATE TABLE entry (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES session(id) ON DELETE RESTRICT,
  on_date               TEXT NOT NULL,
  minutes               INTEGER,
  kid_note              TEXT,
  favourite_problem_id  TEXT REFERENCES problem(id) ON DELETE SET NULL,
  closed_at             TEXT,
  -- the grading timestamp, and the reason the dashboard can go grey honestly
  verified_at           TEXT,
  coach_note            TEXT,
  -- the only three numbers in the system that measure the coach, not the boy
  coach_took_pencil     INTEGER,
  coach_answered_fast   INTEGER,
  coach_lectured        INTEGER,
  created_at            TEXT NOT NULL,
  UNIQUE (session_id, on_date)
);
CREATE INDEX entry_by_date     ON entry(on_date);
CREATE INDEX entry_unverified  ON entry(verified_at, on_date);

CREATE TABLE attempt (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  problem_id     TEXT NOT NULL REFERENCES problem(id) ON DELETE CASCADE,
  -- his claim.  Never overwritten by grading; the disagreement is data.
  kid_mark       TEXT CHECK (kid_mark IN ('got_it', 'tried', 'not_yet')),
  kid_marked_at  TEXT,
  -- the record.  NULL until the coach grades it.
  outcome        TEXT CHECK (outcome IN ('solved_alone', 'solved_with_hint', 'stuck', 'not_attempted')),
  graded_at      TEXT,
  kind           TEXT NOT NULL DEFAULT 'first'
                 CHECK (kind IN ('first', 'carryover', 'retest')),
  -- an attempt that should never have counted: interrupted, misread, mis-tapped
  voided_at      TEXT,
  void_reason    TEXT,
  note           TEXT,
  UNIQUE (entry_id, problem_id)
);
CREATE INDEX attempt_by_problem ON attempt(problem_id);
CREATE INDEX attempt_ungraded   ON attempt(outcome, entry_id);

-- Carry-over and retirement are facts about a problem, not about one evening.
CREATE TABLE problem_state (
  problem_id  TEXT PRIMARY KEY REFERENCES problem(id) ON DELETE CASCADE,
  state       TEXT NOT NULL CHECK (state IN ('open', 'solved', 'retired')),
  since       TEXT NOT NULL,
  reason      TEXT
);
CREATE INDEX problem_state_open ON problem_state(state, since);

CREATE TABLE retest (
  id                       TEXT PRIMARY KEY,
  problem_id               TEXT NOT NULL REFERENCES problem(id) ON DELETE CASCADE,
  due_on                   TEXT NOT NULL,
  stage                    INTEGER NOT NULL DEFAULT 0,   -- 0: 3wk, 1: 10wk, 2: 6mo
  state                    TEXT NOT NULL DEFAULT 'due'
                           CHECK (state IN ('due', 'done', 'failed', 'skipped', 'retired')),
  created_from_attempt_id  TEXT REFERENCES attempt(id) ON DELETE SET NULL,
  resolved_attempt_id      TEXT REFERENCES attempt(id) ON DELETE SET NULL,
  resolved_on              TEXT,
  created_at               TEXT NOT NULL
);
CREATE INDEX retest_due ON retest(state, due_on);
CREATE INDEX retest_by_problem ON retest(problem_id);

CREATE TABLE upload (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT REFERENCES entry(id) ON DELETE CASCADE,
  task_id     TEXT REFERENCES task(id) ON DELETE SET NULL,
  r2_key      TEXT NOT NULL UNIQUE,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,        -- sniffed from the bytes, never trusted from the client
  bytes       INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'other'
              CHECK (kind IN ('sheet_photo', 'notebook_photo', 'typing_screenshot',
                              'folder_screenshot', 'file', 'other')),
  sha256      TEXT,
  superseded_by TEXT REFERENCES upload(id) ON DELETE SET NULL,  -- he may retake a bad photo
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL CHECK (created_by IN ('kid', 'coach'))
);
CREATE INDEX upload_by_entry ON upload(entry_id, created_at);

-- Typing speed and anything else that is measured rather than claimed.
CREATE TABLE measurement (
  id         TEXT PRIMARY KEY,
  on_date    TEXT NOT NULL,
  metric     TEXT NOT NULL,        -- 'typing_wpm', 'typing_accuracy', ...
  value      REAL NOT NULL,
  unit       TEXT,
  upload_id  TEXT REFERENCES upload(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX measurement_by_metric ON measurement(metric, on_date);

-- ─────────────────────────────────────────────────────── system

CREATE TABLE setting (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Bumping an epoch invalidates every cookie issued for that role.  This is the
-- only real answer to "the coach cookie is now on the eleven-year-old's laptop".
INSERT INTO setting (key, value, updated_at) VALUES
  ('epoch_kid',   '1', '1970-01-01T00:00:00Z'),
  ('epoch_coach', '1', '1970-01-01T00:00:00Z');

CREATE TABLE audit (
  id      TEXT PRIMARY KEY,
  at      TEXT NOT NULL,
  role    TEXT NOT NULL,
  action  TEXT NOT NULL,
  detail  TEXT
);
CREATE INDEX audit_by_time ON audit(at);
