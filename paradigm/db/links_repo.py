"""Every read and write of the wiki-link and mention index (009_links.sql, 011_pages.sql).
The only code that knows the note_links, note_mentions and link_index tables.
NoteRepository calls store_links inside its save (a meeting's agenda save too)."""
import sqlite3
from typing import Dict, Iterable, List, Tuple

from paradigm.db.connection import Database
from paradigm.notes.mentions import Mention

__all__ = ["LinkRepository", "store_links"]

_LIVE = "notes.deleted_at IS NULL"


def store_links(conn: sqlite3.Connection, note_id: int, version: int, targets: List[str],
                mentions: Iterable[Mention] = ()) -> None:
    """Replaces a note's links with targets and its mentions, read from its text at version."""
    conn.execute("DELETE FROM note_links WHERE note_id = ?", (note_id,))
    conn.executemany("INSERT INTO note_links (note_id, target) VALUES (?, ?)",
                     [(note_id, target) for target in targets])
    conn.execute("DELETE FROM note_mentions WHERE note_id = ?", (note_id,))
    conn.executemany("INSERT OR IGNORE INTO note_mentions (note_id, field, line, name, context) VALUES (?, ?, ?, ?, ?)",
                     [(note_id,) + tuple(mention) for mention in mentions])
    conn.execute("INSERT INTO link_index (note_id, version) VALUES (?, ?) "
                 "ON CONFLICT (note_id) DO UPDATE SET version = excluded.version", (note_id, version))


class LinkRepository:
    def __init__(self, db: Database):
        self._db = db

    def index(self) -> Dict[str, List[Dict]]:
        """The links and mentions of every live note, and the live notes whose index is out of
        date, with their bodies and a meeting's agenda (so the page can read them again)."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT note_links.note_id, target FROM note_links JOIN notes ON notes.id = note_id "
                "WHERE " + _LIVE + " ORDER BY note_links.note_id, note_links.rowid"
            ).fetchall()
            mention_rows = conn.execute(
                "SELECT note_mentions.* FROM note_mentions JOIN notes ON notes.id = note_id "
                "WHERE " + _LIVE + " ORDER BY note_mentions.note_id, field, line"
            ).fetchall()
            stale = conn.execute(
                "SELECT notes.id, notes.version, notes.body, meetings.agenda FROM notes "
                "LEFT JOIN link_index ON link_index.note_id = notes.id "
                "LEFT JOIN meetings ON meetings.note_id = notes.id "
                "WHERE " + _LIVE + " AND (link_index.version IS NULL OR link_index.version != notes.version) "
                "ORDER BY notes.id"
            ).fetchall()
        targets: Dict[int, List[str]] = {}
        for note_id, target in rows:
            targets.setdefault(note_id, []).append(target)
        return {
            "links": [{"id": note_id, "targets": texts} for note_id, texts in targets.items()],
            "mentions": [{"id": row["note_id"], "field": row["field"], "line": row["line"], "name": row["name"],
                          "context": row["context"]} for row in mention_rows],
            "stale": [_stale(row) for row in stale],
        }

    def catch_up(self, entries: Iterable[Tuple[int, int, List[str], List[Mention]]]) -> List[int]:
        """Stores (note id, version, targets, mentions) for each note still at that version; a
        note saved meanwhile (or trashed) is skipped, since its save brought its own index.
        Returns the ids stored."""
        stored = []
        with self._db.transaction() as conn:
            for note_id, version, targets, mentions in entries:
                row = conn.execute("SELECT version FROM notes WHERE id = ? AND deleted_at IS NULL",
                                   (note_id,)).fetchone()
                if row is not None and row[0] == version:
                    store_links(conn, note_id, version, targets, mentions)
                    stored.append(note_id)
        return stored


def _stale(row: sqlite3.Row) -> Dict:
    entry = {"id": row["id"], "version": row["version"], "body": row["body"]}
    if row["agenda"] is not None:
        entry["agenda"] = row["agenda"]
    return entry
