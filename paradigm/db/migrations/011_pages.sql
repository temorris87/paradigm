-- Pages laid out as fields, meetings out of the tree, and @mentions.
--
-- Meetings, decisions and questions are records shown on their hub's page, never in the
-- tree, so their titles may repeat among siblings (a weekly meeting keeps its name): such a
-- note has title_shared = 1 and the sibling-title index skips it.
ALTER TABLE notes ADD COLUMN title_shared INTEGER NOT NULL DEFAULT 0;

-- A project's state and due date ('YYYY-MM-DD', '' for none). Only projects show them.
ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold'));
ALTER TABLE notes ADD COLUMN due TEXT NOT NULL DEFAULT '';

UPDATE notes SET title_shared = 1 WHERE id IN (
    SELECT note_id FROM meetings UNION SELECT note_id FROM decisions UNION SELECT note_id FROM questions);

DROP INDEX notes_sibling_title;

CREATE UNIQUE INDEX notes_sibling_title
    ON notes (ifnull(parent_id, 0), title COLLATE NOCASE)
    WHERE deleted_at IS NULL AND title_shared = 0;

-- A meeting's date is a field now, not the start of its title.
UPDATE notes SET title = substr(title, 12)
    WHERE id IN (SELECT note_id FROM meetings)
      AND title GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] ?*';

-- Where a decision or question came from: the note (or meeting) it was made from, and the
-- text it was made from, as written there. The record itself sits directly under its hub.
CREATE TABLE record_sources (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id),
    source_id   INTEGER REFERENCES notes (id),     -- NULL: made on the hub itself
    quote       TEXT    NOT NULL DEFAULT ''
);

-- A record that sat under a meeting (or another note in its hub) came from it.
INSERT INTO record_sources (note_id, source_id)
    SELECT notes.id, CASE WHEN parent.parent_id IS NULL THEN NULL ELSE notes.parent_id END
    FROM notes JOIN notes AS parent ON parent.id = notes.parent_id
    WHERE notes.id IN (SELECT note_id FROM decisions UNION SELECT note_id FROM questions);

-- Meetings and records move directly under their hub (their top-level note).
WITH RECURSIVE chain(id, node) AS (
    SELECT id, parent_id FROM notes
        WHERE id IN (SELECT note_id FROM meetings UNION SELECT note_id FROM decisions
                     UNION SELECT note_id FROM questions)
          AND parent_id IS NOT NULL
    UNION ALL
    SELECT chain.id, notes.parent_id FROM chain JOIN notes ON notes.id = chain.node
        WHERE notes.parent_id IS NOT NULL
)
UPDATE notes SET parent_id = (
    SELECT chain.node FROM chain JOIN notes AS top ON top.id = chain.node
    WHERE chain.id = notes.id AND top.parent_id IS NULL)
WHERE id IN (SELECT id FROM chain);

-- A meeting or record has no notes under it: they move up beside it, into the hub. A title
-- taken there (or by another note moving there) gets " (moved N)", N its id, so it is free.
UPDATE notes SET
    title = CASE WHEN EXISTS (
        SELECT 1 FROM notes AS other
        WHERE other.id != notes.id AND other.title = notes.title COLLATE NOCASE
          AND other.deleted_at IS NULL AND other.title_shared = 0
          AND (other.parent_id = (SELECT parent_id FROM notes AS up WHERE up.id = notes.parent_id)
               OR other.parent_id IN (SELECT note_id FROM meetings UNION SELECT note_id FROM decisions
                                      UNION SELECT note_id FROM questions)))
        THEN title || ' (moved ' || id || ')' ELSE title END,
    parent_id = (SELECT parent_id FROM notes AS up WHERE up.id = notes.parent_id)
WHERE parent_id IN (SELECT note_id FROM meetings UNION SELECT note_id FROM decisions
                    UNION SELECT note_id FROM questions)
  AND title_shared = 0;

-- A meeting's agenda: a field of its own beside the minutes (the note's text). agenda_version
-- goes up by one each time it changes, as notes.version does for the body.
ALTER TABLE meetings ADD COLUMN agenda TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN agenda_version INTEGER NOT NULL DEFAULT 1;

-- A person's names and phone. The note's title stays "First Last".
ALTER TABLE people ADD COLUMN first TEXT NOT NULL DEFAULT '';
ALTER TABLE people ADD COLUMN last TEXT NOT NULL DEFAULT '';
ALTER TABLE people ADD COLUMN phone TEXT NOT NULL DEFAULT '';

UPDATE people SET
    first = (SELECT CASE WHEN instr(title, ' ') = 0 THEN title ELSE substr(title, 1, instr(title, ' ') - 1) END
             FROM notes WHERE notes.id = people.note_id),
    last = (SELECT CASE WHEN instr(title, ' ') = 0 THEN '' ELSE substr(title, instr(title, ' ') + 1) END
            FROM notes WHERE notes.id = people.note_id);

-- The @mentions in each note, as written ("PriyaShah"), with the line they are on in which
-- field ('body', or 'agenda' on a meeting) and their context: that line and the lines
-- indented under it. Like note_links, the page reads them with the renderer and sends them
-- with each save; which person a name reaches is worked out in the page.
CREATE TABLE note_mentions (
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    field       TEXT    NOT NULL,
    line        INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    context     TEXT    NOT NULL,
    PRIMARY KEY (note_id, field, line, name)
);

-- Every note's index is read again (now with its mentions, and a meeting's agenda).
DELETE FROM link_index;
