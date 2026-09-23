-- /gree — GRE/TOEFL English trainer. One learner, several devices.
--
-- The client runs the study engine and is the one that knows what happened;
-- the server stores it. Every write is an idempotent event keyed by a
-- client-made uuid, so a phone that loses signal mid-session can resend its
-- whole queue later without double counting anything.
--
-- `day` is the learner's calendar day in Asia/Kolkata, computed on the device
-- at the moment of the event. Timestamps are ISO-8601 UTC.

-- Where each word stands in the Leitner ladder.
-- box 0 = taught but not yet passed; 1..6 = passed, due again after
-- 1, 3, 7, 14, 30, 60 days. A miss drops it back to box 1.
CREATE TABLE card (
  word_id   INTEGER PRIMARY KEY,
  box       INTEGER NOT NULL,
  due       TEXT NOT NULL,          -- YYYY-MM-DD
  right_n   INTEGER NOT NULL DEFAULT 0,
  wrong_n   INTEGER NOT NULL DEFAULT 0,
  first_at  TEXT NOT NULL,
  last_at   TEXT NOT NULL           -- newest write wins across devices
);
CREATE INDEX card_due ON card(due);

-- Same ladder for practice questions (Text Completion / Sentence Equivalence).
CREATE TABLE qstate (
  qid      TEXT PRIMARY KEY,
  box      INTEGER NOT NULL,
  due      TEXT NOT NULL,
  right_n  INTEGER NOT NULL DEFAULT 0,
  wrong_n  INTEGER NOT NULL DEFAULT 0,
  last_at  TEXT NOT NULL
);

-- Every single answer. This is what the progress page is computed from.
CREATE TABLE answer (
  id       TEXT PRIMARY KEY,        -- client uuid
  at       TEXT NOT NULL,
  day      TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('new', 'review', 'redo', 'question')),
  item     TEXT NOT NULL,           -- word id or question id
  mode     TEXT,                    -- meaning / word / blank / synonym / se / tc1 / tc2 / tc3
  correct  INTEGER NOT NULL,
  ms       INTEGER,                 -- time to answer
  device   TEXT
);
CREATE INDEX answer_by_day ON answer(day);

-- Time on the site, counted only while the tab is visible and in use.
-- Sent as small deltas, each with its own id.
CREATE TABLE tick (
  id       TEXT PRIMARY KEY,
  day      TEXT NOT NULL,
  seconds  INTEGER NOT NULL,
  area     TEXT,                    -- study / practice / write / progress
  device   TEXT
);
CREATE INDEX tick_by_day ON tick(day);

-- Work done off the site: POWERPREP, GregMat videos, RC from a book, TOEFL.
CREATE TABLE log (
  id       TEXT PRIMARY KEY,
  day      TEXT NOT NULL,
  kind     TEXT NOT NULL,
  minutes  INTEGER NOT NULL,
  note     TEXT,
  at       TEXT NOT NULL
);
CREATE INDEX log_by_day ON log(day);

CREATE TABLE essay (
  id        TEXT PRIMARY KEY,
  day       TEXT NOT NULL,
  task      TEXT NOT NULL,          -- gre_issue / toefl_email / toefl_discussion / free
  prompt    TEXT NOT NULL,
  body      TEXT NOT NULL,
  words     INTEGER NOT NULL,
  seconds   INTEGER,
  checks    TEXT,                   -- JSON: which self-review items were ticked
  feedback  TEXT,                   -- filled in later when Claude grades it
  at        TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE setting (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

INSERT INTO setting (key, value, updated_at) VALUES
  ('epoch', '1', '1970-01-01T00:00:00Z'),
  ('new_per_day', '20', '1970-01-01T00:00:00Z');
