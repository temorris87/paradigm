-- Notes and their hierarchy: a note sits under one parent note, or at the top (no parent).
CREATE TABLE notes (
    id          INTEGER PRIMARY KEY,
    parent_id   INTEGER REFERENCES notes (id),
    title       TEXT    NOT NULL,
    body        TEXT    NOT NULL DEFAULT '',
    -- Goes up by one each time the body changes; a save names the version it started from,
    -- so two tabs can't overwrite each other. A rename or move leaves it alone.
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    -- Set when deleted: the row stays, so nothing is lost.
    deleted_at  TEXT
);

-- Siblings never share a title (ignoring case), so a path like A/B names one note.
CREATE UNIQUE INDEX notes_sibling_title
    ON notes (ifnull(parent_id, 0), title COLLATE NOCASE)
    WHERE deleted_at IS NULL;

CREATE INDEX notes_parent ON notes (parent_id);
