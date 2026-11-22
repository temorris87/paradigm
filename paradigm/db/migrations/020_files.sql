-- Files kept in OneDrive, attached to notes. The synced file on this computer is the source
-- of truth: Paradigm never copies it. A folder is linked to a hub; its files are listed by
-- reading the folder (each file's path relative to it), and a file can be attached to any
-- number of notes (a meeting, a phase, a project...).
CREATE TABLE file_folders (
    id          INTEGER PRIMARY KEY,
    note_id     INTEGER NOT NULL REFERENCES notes (id),   -- the hub it was linked on
    path        TEXT    NOT NULL,                         -- absolute, as on this computer
    created_at  TEXT    NOT NULL,
    scanned_at  TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE files (
    id          INTEGER PRIMARY KEY,
    folder_id   INTEGER NOT NULL REFERENCES file_folders (id),
    rel_path    TEXT    NOT NULL,                         -- '/'-separated, inside the folder
    name        TEXT    NOT NULL,
    size        INTEGER NOT NULL DEFAULT 0,
    modified    TEXT    NOT NULL DEFAULT '',
    missing     INTEGER NOT NULL DEFAULT 0,               -- gone from the folder at the last read
    UNIQUE (folder_id, rel_path)
);

CREATE TABLE file_links (
    file_id     INTEGER NOT NULL REFERENCES files (id),
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    added_at    TEXT    NOT NULL,
    PRIMARY KEY (file_id, note_id)
);

CREATE INDEX file_links_note ON file_links (note_id);
