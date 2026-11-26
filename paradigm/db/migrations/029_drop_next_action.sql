-- The next action is gone: every open task shows in the Week tray, narrowed by its hub filter,
-- so no task needs the flag 022 added. DROP COLUMN needs SQLite 3.35+, which Python 3.11 bundles.
-- No index or trigger uses the column.
ALTER TABLE tasks DROP COLUMN is_next;
