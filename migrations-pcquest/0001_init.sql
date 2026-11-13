-- PC Quest — schema for PCQUEST_DB.
--
-- PC Quest is the Windows app that gives Monit hands-on computer tasks (spec:
-- learning repo, pcquest/docs/TASK-FORMAT.md). Its own database, like
-- activity and gree, so nothing here mixes with the maths record.
--
-- Apply exactly like the others (see docs/learning/operations.md):
--   npx wrangler d1 execute pcquest --local  --file migrations-pcquest/0001_init.sql -y
--   npx wrangler d1 execute pcquest --remote --file migrations-pcquest/0001_init.sql -y

-- One row per pack. `wire` is the signed JSON exactly as `quest push` sent it
-- ({"payload": "...", "sig": "..."}); the server never re-serialises it, so
-- the signature the laptop checks is the one Kirtan made. Packs are retired,
-- never deleted, and deleting one would never delete events anyway.
CREATE TABLE pq_pack (
  id         TEXT PRIMARY KEY,              -- the payload's `pack`
  wire       TEXT NOT NULL,
  version    INTEGER NOT NULL,              -- bumped by the server on every push
  updated_at TEXT NOT NULL,                 -- ISO UTC
  retired    INTEGER NOT NULL DEFAULT 0
);

-- Images referenced by a pack. One row per (pack, path), so the same picture
-- in two packs (or at two paths) is two rows and neither pack can lose it.
-- The laptop caches by sha256 and fetches by it; any row with that hash will do.
CREATE TABLE pq_asset (
  pack_id TEXT NOT NULL,
  path    TEXT NOT NULL,                    -- as referenced in the pack, e.g. assets/start.png
  sha256  TEXT NOT NULL,                    -- lowercase hex of `bytes`
  bytes   BLOB NOT NULL,
  PRIMARY KEY (pack_id, path)
);
CREATE INDEX idx_pq_asset_sha ON pq_asset(sha256);

-- One row per install. The id is chosen by the app; label is for humans.
CREATE TABLE pq_device (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  app_version TEXT,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
);

-- The event log. `at` is the laptop's clock (clamped to -30d..+1d of the
-- server's); `received_at` is the server's. The id is the app's UUID, so a
-- re-sent outbox is harmless. Heartbeats are kept as one row per device per
-- IST day (id = hb|device|day), never one per sync.
CREATE TABLE pq_event (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  at          TEXT NOT NULL,
  received_at TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN (
                'start', 'step', 'done', 'hint', 'pointed', 'point_miss', 'wrong',
                'reset', 'blocked_caps', 'bad_sig', 'heartbeat')),
  task        TEXT,
  rev         INTEGER,
  step        TEXT,
  detail      TEXT                          -- JSON object, or NULL
);
CREATE INDEX idx_pq_event_task ON pq_event(task);
CREATE INDEX idx_pq_event_received ON pq_event(received_at);

-- `quest approve <task>`: passes a `parent` check.
CREATE TABLE pq_approval (
  task TEXT PRIMARY KEY,
  at   TEXT NOT NULL,
  note TEXT
);

-- `quest reset <task>`: he gets a fresh attempt next sync. The app applies a
-- reset only if `at` is newer than the attempt it has.
CREATE TABLE pq_reset (
  task TEXT PRIMARY KEY,
  at   TEXT NOT NULL
);

-- `quest release`: app updates announced in the sync response.
CREATE TABLE pq_release (
  version TEXT PRIMARY KEY,
  url     TEXT NOT NULL,
  sha256  TEXT NOT NULL,
  at      TEXT NOT NULL
);
