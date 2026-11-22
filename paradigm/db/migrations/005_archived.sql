-- Archived hubs: set on a top-level note when it is archived, with everything under it. A note
-- is archived when its top-level note is. Only a top-level note carries it: the repository
-- clears it when a note moves under another one. The kind and area link stay, so a restored
-- hub goes back where it was.
ALTER TABLE notes ADD COLUMN archived_at TEXT;
