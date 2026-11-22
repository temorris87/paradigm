-- The wiki-link index: what each note's [[wiki links]] say, as written ("Style guide/Colours",
-- heading and alias dropped). It is derived from the bodies, so it could always be rebuilt.
-- The texts stay unresolved: which note a link reaches depends on the tree (nearest note
-- wins, static/js/notes/resolve.js), and that changes without the linking note changing.
-- The browser extracts the links, with the renderer that draws them, and sends them with
-- each save. A trashed note keeps its rows, so its links come back with it; readers skip it.
CREATE TABLE note_links (
    note_id     INTEGER NOT NULL REFERENCES notes (id),
    target      TEXT    NOT NULL,
    PRIMARY KEY (note_id, target)
);

-- The note version the stored links were read from. A note whose version is newer (or that
-- has no row) is stale: the page reads its links again and sends them back.
CREATE TABLE link_index (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id),
    version     INTEGER NOT NULL
);
