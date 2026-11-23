-- A next action: one flagged open task per note (a project, an area, a phase...), shown as
-- NEXT. tasks_repo keeps at most one open is_next per note; with none flagged, the first open
-- task in order stands in (the page works that out).
ALTER TABLE tasks ADD COLUMN is_next INTEGER NOT NULL DEFAULT 0;
