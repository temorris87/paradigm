-- Meeting capture: a "T: ..." line in a meeting's notes becomes a task on its hub. Its source
-- (the meeting and the line's text) is kept, so saving again never makes it twice
-- (decisions and questions keep theirs in record_sources).
CREATE TABLE task_sources (
    task_id     INTEGER PRIMARY KEY REFERENCES tasks (id) ON DELETE CASCADE,
    source_id   INTEGER NOT NULL REFERENCES notes (id),
    quote       TEXT    NOT NULL
);

CREATE INDEX task_sources_source ON task_sources (source_id);

-- A task of mine done for someone ("I owe them"): a name later in a T: line, or set in Edit….
ALTER TABLE tasks ADD COLUMN for_person_id INTEGER REFERENCES notes (id);
