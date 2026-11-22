-- PARA hubs: a top-level note can be a project, an area or a resource. NULL means not filed
-- yet (the Inbox). Only top-level notes carry a kind: the repository clears it when a note
-- moves under another one.
ALTER TABLE notes ADD COLUMN kind TEXT CHECK (kind IN ('project', 'area', 'resource'));
