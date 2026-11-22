-- A project's plan: phases (stretches of activity) and milestones (dated points), each a
-- note of its own. A phases row makes a note a phase (directly under its project); a
-- milestones row a milestone (directly under its project or one of its phases).
--
-- Every change of a date is kept in schedule_changes, so a slipping plan shows: the first
-- dates set are the baseline (baseline_*), the current ones may have moved since.
CREATE TABLE phases (
    note_id         INTEGER PRIMARY KEY REFERENCES notes (id),
    start           TEXT    NOT NULL,              -- 'YYYY-MM-DD'
    end             TEXT    NOT NULL,              -- 'YYYY-MM-DD', on or after start
    baseline_start  TEXT    NOT NULL,
    baseline_end    TEXT    NOT NULL
);

CREATE TABLE milestones (
    note_id         INTEGER PRIMARY KEY REFERENCES notes (id),
    day             TEXT    NOT NULL,
    baseline_day    TEXT    NOT NULL,
    done_day        TEXT    NOT NULL DEFAULT ''    -- '' while it is still to come
);

CREATE TABLE schedule_changes (
    id          INTEGER PRIMARY KEY,
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    field       TEXT    NOT NULL CHECK (field IN ('start', 'end', 'day')),
    old         TEXT    NOT NULL,
    new         TEXT    NOT NULL,
    changed_at  TEXT    NOT NULL,
    reason      TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX schedule_changes_note ON schedule_changes (note_id);

-- Milestones may share titles, like meetings and records ("Go-live" in every project).
