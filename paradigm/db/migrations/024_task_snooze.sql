-- Snoozing a task (z on Today): it leaves Up next until that day. '' for not snoozed.
ALTER TABLE tasks ADD COLUMN snoozed_until TEXT NOT NULL DEFAULT '';
