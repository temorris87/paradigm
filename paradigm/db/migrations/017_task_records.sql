-- Tasks are records of their own now, made and changed in a page's Tasks section, never read
-- from "- [ ]" lines in the text (Tyson, 2026-11-22; no real notes existed yet, so the old
-- text-read tasks and their blocks are dropped rather than carried over).
--
-- A task belongs to one note (a project, an area, a phase, a meeting, any note in a hub);
-- a subtask has a parent task on the same note, one level deep. A task can be delegated to
-- a person (their note), with a day to follow it up.
DROP TABLE task_sessions;
DROP TABLE task_texts;
DROP TABLE tasks;

CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    parent_id   INTEGER REFERENCES tasks (id),     -- NULL: a task; else its task (one level)
    title       TEXT    NOT NULL,
    notes       TEXT    NOT NULL DEFAULT '',       -- a few lines of its own
    due         TEXT    NOT NULL DEFAULT '',       -- 'YYYY-MM-DD', '' for none
    delegate_id INTEGER REFERENCES notes (id),     -- the person doing it; NULL: me
    follow_up   TEXT    NOT NULL DEFAULT '',       -- 'YYYY-MM-DD' to chase a delegated task
    done        INTEGER NOT NULL DEFAULT 0,
    done_day    TEXT    NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,        -- order among its siblings
    created_at  TEXT    NOT NULL,
    removed_at  TEXT                               -- deleted, kept for its logged time
);

CREATE INDEX tasks_note ON tasks (note_id);
CREATE INDEX tasks_delegate ON tasks (delegate_id);

-- When a task is worked on: a block on the calendar. A block that has passed is time worked.
CREATE TABLE task_sessions (
    id          INTEGER PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks (id),
    day         TEXT    NOT NULL,
    start       TEXT    NOT NULL,
    end         TEXT    NOT NULL
);

CREATE INDEX task_sessions_day ON task_sessions (day);
CREATE INDEX task_sessions_task ON task_sessions (task_id);
