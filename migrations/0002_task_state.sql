-- The computer track needs somewhere to record that a rung was climbed.
--
-- It cannot reuse `attempt`, which is anchored to `problem` and carries a
-- four-way outcome that means nothing here: "solved with a hint" is not a
-- thing that happens when you make a folder. And it cannot be left implicit
-- in `upload`, because the concept rungs ("say what a path is") produce no
-- file at all — those are the ones most likely to be quietly skipped, which
-- is exactly what this table exists to make visible.
--
-- Two states rather than one, for the same reason `attempt` has two columns:
-- 'claimed' is his word for it, 'done' is his father's.

CREATE TABLE task_state (
  task_id             TEXT PRIMARY KEY REFERENCES task(id) ON DELETE CASCADE,
  state               TEXT NOT NULL CHECK (state IN ('todo', 'claimed', 'done', 'skipped')),
  on_date             TEXT,
  note                TEXT,
  evidence_upload_id  TEXT REFERENCES upload(id) ON DELETE SET NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX task_state_by_state ON task_state(state);
