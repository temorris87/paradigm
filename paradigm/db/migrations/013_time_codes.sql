-- The code time is booked to on the timesheet: a project's or an area's ('' for none). A
-- project with none books to its area's.
ALTER TABLE notes ADD COLUMN time_code TEXT NOT NULL DEFAULT '';
