-- Tasks: each "- [ ]" (or "- [x]") list item in a note's text is a task; a box nested under
-- another box is its subtask. The text is the source: the page reads the boxes with the
-- Markdown renderer and sends them with every save, as it does the links. A task keeps its
-- row while its line moves or is edited (the server follows the line from the text the tasks
-- were last read from, kept in task_texts), so the sessions scheduled for it stay with it.
CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    field       TEXT    NOT NULL,              -- 'body', or 'agenda' on a meeting
    line        INTEGER NOT NULL,              -- 0-based line of its box in that field
    parent_id   INTEGER REFERENCES tasks (id), -- the box it is nested under, NULL at the top
    title       TEXT    NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    done_day    TEXT    NOT NULL DEFAULT '',   -- 'YYYY-MM-DD' it was ticked, '' while open
    removed_at  TEXT                           -- its line was deleted; kept for its logged time
);

CREATE INDEX tasks_note ON tasks (note_id);

-- The text of each field the note's tasks were last read from: the next save is compared
-- with it to follow each task's line.
CREATE TABLE task_texts (
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    field       TEXT    NOT NULL,
    text        TEXT    NOT NULL,
    PRIMARY KEY (note_id, field)
);

-- When a task is worked on: a block on the calendar. A block that has passed is time worked.
CREATE TABLE task_sessions (
    id          INTEGER PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks (id),
    day         TEXT    NOT NULL,              -- 'YYYY-MM-DD'
    start       TEXT    NOT NULL,              -- 'HH:MM'
    end         TEXT    NOT NULL               -- 'HH:MM', after start, same day
);

CREATE INDEX task_sessions_day ON task_sessions (day);
CREATE INDEX task_sessions_task ON task_sessions (task_id);

-- Every note is read again, now with its tasks.
DELETE FROM link_index;
