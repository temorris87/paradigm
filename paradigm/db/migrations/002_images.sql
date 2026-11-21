-- Images pasted or dropped into notes. The bytes live here, so the database file is the
-- whole of the user's data. A note links to an image as /api/image?id=N.
CREATE TABLE images (
    id          INTEGER PRIMARY KEY,
    -- The note it was added to. The image stays when the link or the note goes.
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    -- Read from the bytes themselves, never from what the browser said.
    mime        TEXT    NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    size        INTEGER NOT NULL,
    -- The same bytes added to the same note again get the same row back.
    sha256      TEXT    NOT NULL,
    data        BLOB    NOT NULL,
    created_at  TEXT    NOT NULL
);

CREATE UNIQUE INDEX images_note_sha ON images (note_id, sha256);
