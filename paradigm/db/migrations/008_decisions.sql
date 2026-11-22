-- Decisions and questions: each is a note inside a hub (its title says the decision or asks
-- the question; its text is the why, or the discussion and answer) with a row here; the row
-- is what makes the note a decision or a question. One under a meeting came from it. As with
-- meetings, notes.kind stays NULL: the repository reports 'decision' or 'question'. A trashed
-- note keeps its row and people, so they come back with it; readers skip it.
CREATE TABLE decisions (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id),
    day         TEXT    NOT NULL               -- 'YYYY-MM-DD', the day it was decided
);

CREATE TABLE questions (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id),
    day         TEXT    NOT NULL,              -- 'YYYY-MM-DD', the day it was asked
    answered    TEXT    NOT NULL DEFAULT ''    -- 'YYYY-MM-DD', '' while it is open
);

-- The people involved in a decision or question (who decided, who asked, who owns it). A
-- trashed person keeps their rows; readers skip them.
CREATE TABLE record_people (
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    person_id   INTEGER NOT NULL REFERENCES people (note_id),
    PRIMARY KEY (note_id, person_id)
);

CREATE INDEX record_people_person ON record_people (person_id);
