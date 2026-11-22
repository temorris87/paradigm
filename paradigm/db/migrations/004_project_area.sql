-- A project can belong to one area. Only a top-level project carries one: the repository
-- clears it when the note stops being a project, and on projects whose area stops being one.
-- A trashed area keeps its projects' links (they come back with it); readers skip it.
ALTER TABLE notes ADD COLUMN area_id INTEGER REFERENCES notes (id);
