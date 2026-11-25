-- The PC Quest helper agent (learning repo, pcquest/agent/). It runs on the
-- Arch box, looks at the laptop over SSH, and credits steps he really did
-- (as `step`/`done` events with device_id 'agent') or resets a task he can't
-- finish. Every decision is a row here, shown on /learning/coach.
CREATE TABLE pq_agent_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,                   -- ISO UTC
  task   TEXT,                            -- null for run-level notes
  action TEXT NOT NULL,                   -- credit | reset | wait | note
  steps  TEXT,                            -- JSON array of step ids, for credit
  reason TEXT NOT NULL                    -- plain English, for Kirtan
);
CREATE INDEX idx_pq_agent_log_at ON pq_agent_log(at);

-- Key/value: 'last_run' = JSON {at, laptopOnline, open, note}.
CREATE TABLE pq_agent_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
