-- The Trash: a note deleted more than a week ago is deleted for good (trash_repo.py purge).
-- An image keeps the note it was added to in note_id, but another note may still link to it
-- once that note is gone for good, so note_id may now be NULL. SQLite cannot change a
-- column's constraint, so the table is rebuilt with the same rows.
CREATE TABLE images_new (
    id          INTEGER PRIMARY KEY,
    -- The note it was added to; NULL once that note is deleted for good. The image stays
    -- while any note links to it (the sweep at start and stop removes the rest).
    note_id     INTEGER REFERENCES notes (id),
    mime        TEXT    NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    size        INTEGER NOT NULL,
    sha256      TEXT    NOT NULL,
    data        BLOB    NOT NULL,
    created_at  TEXT    NOT NULL
);

INSERT INTO images_new (id, note_id, mime, width, height, size, sha256, data, created_at)
    SELECT id, note_id, mime, width, height, size, sha256, data, created_at FROM images;

DROP TABLE images;

ALTER TABLE images_new RENAME TO images;

-- The same bytes added to the same note again get the same row back.
CREATE UNIQUE INDEX images_note_sha ON images (note_id, sha256);

-- Finding what to delete for good.
CREATE INDEX notes_deleted ON notes (deleted_at) WHERE deleted_at IS NOT NULL;
