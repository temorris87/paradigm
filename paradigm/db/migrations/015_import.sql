-- The Outlook import. Each occurrence Outlook exports is its own event: its uid and its
-- day (the day Outlook first gave it) name it, and lead to the meeting made from it.
CREATE TABLE meeting_sources (
    uid         TEXT    NOT NULL,
    day         TEXT    NOT NULL,
    meeting_id  INTEGER NOT NULL REFERENCES meetings (note_id),
    cancelled_by_import INTEGER NOT NULL DEFAULT 0,  -- the import cancelled it (it may undo that)
    PRIMARY KEY (uid, day)
);

CREATE INDEX meeting_sources_meeting ON meeting_sources (meeting_id);

-- Imported events with no hub yet: the calendar's To file list. Filing one makes the meeting.
CREATE TABLE import_pending (
    id          INTEGER PRIMARY KEY,
    uid         TEXT    NOT NULL,
    day         TEXT    NOT NULL,
    time        TEXT    NOT NULL DEFAULT '',
    end_time    TEXT    NOT NULL DEFAULT '',
    title       TEXT    NOT NULL,
    recurring   INTEGER NOT NULL DEFAULT 0,
    location    TEXT    NOT NULL DEFAULT '',
    join_url    TEXT    NOT NULL DEFAULT '',
    agenda      TEXT    NOT NULL DEFAULT '',
    attendees   TEXT    NOT NULL DEFAULT '[]',    -- JSON [{name, email}]
    ignored     INTEGER NOT NULL DEFAULT 0,       -- "Don't import": kept so it isn't offered again
    UNIQUE (uid, day)
);

-- The days an import ran: the calendar and Home remind until today's has.
CREATE TABLE import_log (
    day         TEXT    PRIMARY KEY,
    at          TEXT    NOT NULL
);
