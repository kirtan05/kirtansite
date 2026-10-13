-- /learning activity monitor — schema for ACTIVITY_DB.
--
-- A separate database from LEARNING_DB on purpose: a browsing timeline must
-- never mix with the maths record (same reasoning as /gree's own database).
--
-- Apply exactly like the others (see docs/learning/operations.md):
--   npx wrangler d1 execute activity --local  --file migrations-activity/0001_init.sql -y
--   npx wrangler d1 execute activity --remote --file migrations-activity/0001_init.sql -y

-- One row per laptop. The id is a random token chosen at install time and
-- also used to authenticate ingest; label is for humans.
CREATE TABLE activity_device (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen  TEXT                  -- most recent ingest or heartbeat, ISO UTC
);

-- Raw ActivityWatch events. `day` is the IST calendar date the event started,
-- stored so the common "one day" query is a single indexed range.
CREATE TABLE activity_event (
  id         TEXT PRIMARY KEY,     -- assigned server-side
  device_id  TEXT NOT NULL REFERENCES activity_device(id),
  bucket     TEXT NOT NULL CHECK (bucket IN ('window', 'afk', 'web')),
  started_at TEXT NOT NULL,        -- ISO UTC
  duration_s REAL NOT NULL CHECK (duration_s >= 0),
  app        TEXT,                 -- window: executable / app name
  title      TEXT,                 -- window: title
  url        TEXT,                 -- web: full url
  host       TEXT,                 -- web: hostname, derived server-side
  status     TEXT,                 -- afk: 'afk' | 'not-afk'
  day        TEXT NOT NULL,        -- 'YYYY-MM-DD' in IST
  created_at TEXT NOT NULL
);
CREATE INDEX idx_event_day ON activity_event(day);

-- Tracker lifecycle, reported by the watchdog and the uploader. A 'stopped'
-- followed by a 'started' is a gap the day view shows honestly; a heartbeat is
-- just "still running at this time".
CREATE TABLE activity_tracker_event (
  id        TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES activity_device(id),
  kind      TEXT NOT NULL CHECK (kind IN ('stopped', 'started', 'heartbeat')),
  at        TEXT NOT NULL,         -- ISO UTC
  detail    TEXT,
  day       TEXT NOT NULL          -- IST date of `at`
);
CREATE INDEX idx_tracker_device_day ON activity_tracker_event(device_id, day);

-- Daily rollup, kept after raw events are pruned at 90 days. One row per
-- (device, day, dimension, key); dimension is 'app' or 'host'.
CREATE TABLE activity_daily (
  device_id TEXT NOT NULL REFERENCES activity_device(id),
  day       TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('app', 'host')),
  key       TEXT NOT NULL,
  seconds   REAL NOT NULL,
  PRIMARY KEY (device_id, day, dimension, key)
);
