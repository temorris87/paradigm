-- Resources are plain notes sorted into folders. A folder is only a name: it nests in another
-- folder (parent_id) and holds top-level resource notes (notes.folder_id; NULL: the top of
-- Resources). Folder names are unique within their parent (folders_repo.py). A trashed folder
-- carries deleted_at, as a note does, and goes for good with the purge.
CREATE TABLE resource_folders (
    id          INTEGER PRIMARY KEY,
    parent_id   INTEGER REFERENCES resource_folders (id),
    title       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    deleted_at  TEXT
);

CREATE INDEX resource_folders_parent ON resource_folders (parent_id);

ALTER TABLE notes ADD COLUMN folder_id INTEGER REFERENCES resource_folders (id);

-- A resource is no longer a hub. One that holds what only a hub may (a meeting, decision or
-- question under it, trashed ones too; people on it; a linked OneDrive folder) becomes an
-- area instead, so nothing it holds is lost; it can be filed again from there.
UPDATE notes SET kind = 'area'
WHERE kind = 'resource' AND parent_id IS NULL AND (
    id IN (SELECT hub_id FROM hub_people)
    OR id IN (SELECT note_id FROM file_folders)
    OR id IN (SELECT notes.parent_id FROM notes JOIN meetings ON meetings.note_id = notes.id)
    OR id IN (SELECT notes.parent_id FROM notes JOIN decisions ON decisions.note_id = notes.id)
    OR id IN (SELECT notes.parent_id FROM notes JOIN questions ON questions.note_id = notes.id)
);
