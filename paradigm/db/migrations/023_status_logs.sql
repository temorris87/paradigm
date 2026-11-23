-- A status log: dated entries on a project or an area saying where it stands, each with a
-- health (on track, at risk, blocked) and a few words. The newest is the hub's health; the
-- older ones are its history. Never written into the note's text.
CREATE TABLE status_logs (
    id          INTEGER PRIMARY KEY,
    note_id     INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    day         TEXT    NOT NULL,       -- 'YYYY-MM-DD', local
    health      TEXT    NOT NULL CHECK (health IN ('on_track', 'at_risk', 'blocked')),
    text        TEXT    NOT NULL,       -- Markdown, short
    created_at  TEXT    NOT NULL
);

CREATE INDEX status_logs_note ON status_logs (note_id, day DESC);
