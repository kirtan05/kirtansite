-- /learning activity monitor — allow a 'media' bucket (his Android phone).
--
-- aw-android's MediaWatcher records what was playing (title, channel/artist,
-- app, playing/paused) — on the phone that is how we learn which YouTube
-- videos were watched, since there are no window titles. SQLite cannot alter a
-- CHECK constraint, so activity_event is rebuilt with the wider check. Nothing
-- references activity_event, and the copy keeps every column and row.
--
--   npx wrangler d1 execute activity --local  --file migrations-activity/0002_phone_media.sql -y
--   npx wrangler d1 execute activity --remote --file migrations-activity/0002_phone_media.sql -y

CREATE TABLE activity_event_new (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES activity_device(id),
  bucket     TEXT NOT NULL CHECK (bucket IN ('window', 'afk', 'web', 'media')),
  started_at TEXT NOT NULL,        -- ISO UTC
  duration_s REAL NOT NULL CHECK (duration_s >= 0),
  app        TEXT,                 -- window/media: app name
  title      TEXT,                 -- window: title; media: "title · artist"
  url        TEXT,                 -- web: full url
  host       TEXT,                 -- web: hostname, derived server-side
  status     TEXT,                 -- afk: 'afk' | 'not-afk'; media: 'playing' | 'paused' | …
  day        TEXT NOT NULL,        -- 'YYYY-MM-DD' in IST
  created_at TEXT NOT NULL
);

INSERT INTO activity_event_new
  SELECT id, device_id, bucket, started_at, duration_s, app, title, url, host, status, day, created_at
    FROM activity_event;

DROP TABLE activity_event;
ALTER TABLE activity_event_new RENAME TO activity_event;
CREATE INDEX idx_event_day ON activity_event(day);
