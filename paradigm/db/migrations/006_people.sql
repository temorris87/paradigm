-- People: a shared directory. A person is a top-level note (their own free text) with a row
-- here holding the fields; the row is what makes the note a person. notes.kind stays NULL on
-- a person's note (its CHECK can't be widened without rebuilding the notes table): the
-- repository reports the kind as 'person'. A trashed person keeps the row and their links,
-- so they come back with the note; readers skip them.
CREATE TABLE people (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id),
    org         TEXT    NOT NULL DEFAULT '',
    job         TEXT    NOT NULL DEFAULT '',
    email       TEXT    NOT NULL DEFAULT ''
);

-- Who is on a hub, and as what (free text, '' for no role). One role per person per hub.
-- Links stay when a hub is archived, trashed or stops being a hub; readers show only those
-- whose hub is a hub now, so filing it again brings its people back.
CREATE TABLE hub_people (
    hub_id      INTEGER NOT NULL REFERENCES notes (id),
    person_id   INTEGER NOT NULL REFERENCES people (note_id),
    role        TEXT    NOT NULL DEFAULT '',
    PRIMARY KEY (hub_id, person_id)
);

CREATE INDEX hub_people_person ON hub_people (person_id);
