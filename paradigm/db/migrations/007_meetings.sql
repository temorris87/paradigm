-- Meetings: a meeting is a note inside a hub (its text is the minutes) with a row here holding
-- its date and time; the row is what makes the note a meeting. Its hub is its top-level note.
-- notes.kind stays NULL on a meeting's note: the repository reports the kind as 'meeting'. A
-- trashed meeting keeps its row and attendees, so they come back with the note; readers skip it.
CREATE TABLE meetings (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id),
    day         TEXT    NOT NULL,              -- 'YYYY-MM-DD'
    time        TEXT    NOT NULL DEFAULT ''    -- 'HH:MM', '' for no time
);

-- Who attended. A trashed person keeps their rows (they come back with the note); readers
-- skip them.
CREATE TABLE meeting_people (
    meeting_id  INTEGER NOT NULL REFERENCES meetings (note_id),
    person_id   INTEGER NOT NULL REFERENCES people (note_id),
    PRIMARY KEY (meeting_id, person_id)
);

CREATE INDEX meeting_people_person ON meeting_people (person_id);
