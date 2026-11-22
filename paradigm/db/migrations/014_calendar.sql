-- Meetings on the calendar: an end time ('' for none: it lasts 30 minutes), cancelled ones
-- (kept, struck through, never counted as time), and where and how to join.
ALTER TABLE meetings ADD COLUMN end_time TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN join_url TEXT NOT NULL DEFAULT '';
