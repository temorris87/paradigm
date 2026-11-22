"""Every read and write of the wiki-link index (009_links.sql). The only code that knows the
note_links and link_index tables. NoteRepository calls store_links inside its save."""
import sqlite3
from typing import Dict, Iterable, List, Tuple

from paradigm.db.connection import Database

__all__ = ["LinkRepository", "store_links"]

_LIVE = "notes.deleted_at IS NULL"


def store_links(conn: sqlite3.Connection, note_id: int, version: int, targets: List[str]) -> None:
    """Replaces a note's links with targets, read from its body at version."""
    conn.execute("DELETE FROM note_links WHERE note_id = ?", (note_id,))
    conn.executemany("INSERT INTO note_links (note_id, target) VALUES (?, ?)",
                     [(note_id, target) for target in targets])
    conn.execute("INSERT INTO link_index (note_id, version) VALUES (?, ?) "
                 "ON CONFLICT (note_id) DO UPDATE SET version = excluded.version", (note_id, version))


class LinkRepository:
    def __init__(self, db: Database):
        self._db = db

    def index(self) -> Dict[str, List[Dict]]:
        """The links of every live note, and the live notes whose links are out of date, with
        their bodies (so the page can read them again)."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT note_links.note_id, target FROM note_links JOIN notes ON notes.id = note_id "
                "WHERE " + _LIVE + " ORDER BY note_links.note_id, note_links.rowid"
            ).fetchall()
            stale = conn.execute(
                "SELECT notes.id, notes.version, notes.body FROM notes "
                "LEFT JOIN link_index ON link_index.note_id = notes.id "
                "WHERE " + _LIVE + " AND (link_index.version IS NULL OR link_index.version != notes.version) "
                "ORDER BY notes.id"
            ).fetchall()
        targets: Dict[int, List[str]] = {}
        for note_id, target in rows:
            targets.setdefault(note_id, []).append(target)
        return {
            "links": [{"id": note_id, "targets": texts} for note_id, texts in targets.items()],
            "stale": [{"id": row["id"], "version": row["version"], "body": row["body"]} for row in stale],
        }

    def catch_up(self, entries: Iterable[Tuple[int, int, List[str]]]) -> List[int]:
        """Stores (note id, version, targets) for each note still at that version; a note
        saved meanwhile (or trashed) is skipped, since its save brought its own links.
        Returns the ids stored."""
        stored = []
        with self._db.transaction() as conn:
            for note_id, version, targets in entries:
                row = conn.execute("SELECT version FROM notes WHERE id = ? AND deleted_at IS NULL",
                                   (note_id,)).fetchone()
                if row is not None and row[0] == version:
                    store_links(conn, note_id, version, targets)
                    stored.append(note_id)
        return stored
