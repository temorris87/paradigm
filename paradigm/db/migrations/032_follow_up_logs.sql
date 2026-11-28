-- Each time I follow up a delegated task (Today's "Followed up..."): the day, what happened,
-- and whether it was closed or given a new follow-up day. A task's logs go with its row (a
-- real delete, as trash purge makes); task remove, which only marks the row, drops them itself.
CREATE TABLE follow_up_logs (
    id          INTEGER PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    day         TEXT    NOT NULL,          -- 'YYYY-MM-DD', local: when I followed up
    note        TEXT    NOT NULL DEFAULT '',
    outcome     TEXT    NOT NULL CHECK (outcome IN ('again', 'closed')),
    next_day    TEXT    NOT NULL DEFAULT '', -- the new follow-up day for 'again', else ''
    created_at  TEXT    NOT NULL
);
CREATE INDEX follow_up_logs_task ON follow_up_logs (task_id, day);
