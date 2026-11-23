-- A task's estimate in minutes (NULL: not estimated, "est?"): what s places on the week and
-- what the week's capacity counts.
ALTER TABLE tasks ADD COLUMN estimate_min INTEGER;
