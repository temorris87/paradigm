-- To raise at the next 1:1 with a person: a few words, where they were written (a note and
-- its line, for "@Name ?" lines; none when added by hand), and when they were raised (ticked
-- off in a 1:1; '' while still to raise).
CREATE TABLE person_topics (
    id              INTEGER PRIMARY KEY,
    person_id       INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    text            TEXT    NOT NULL,
    source_note_id  INTEGER REFERENCES notes (id) ON DELETE SET NULL,
    source_line     INTEGER,
    created_at      TEXT    NOT NULL,
    raised_at       TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX person_topics_person ON person_topics (person_id);
