"""Folders in Resources (021_resource_folders.sql): names that hold resource notes and other
folders. A folder has no text. Its name is unique within its parent folder and follows the
note title rules. Folders never appear in a note's path or links.

Trashing a folder trashes the folders inside it and the notes in them, with the notes under
those. All get the same deleted_at, so they show in the Trash as the notes they are.
Restoring one of those notes brings its folders back (trash_repo.py), and the purge deletes
for good the trashed folders no note points at any more.
"""
import sqlite3
from typing import Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import Clock, LastNote, NotFound, TitleTaken, WouldCycle, utc_now
from paradigm.notes.titles import BadTitle, clean_title

__all__ = ["FolderRepository", "NotFound", "TitleTaken", "WouldCycle", "BadTitle", "LastNote",
           "restore_folder_chain", "purge_folders"]

_LIVE = "deleted_at IS NULL"


class FolderRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every live folder: {id, parent_id, title}, by title."""
        with self._db.reading() as conn:
            rows = conn.execute("SELECT id, parent_id, title FROM resource_folders WHERE " + _LIVE
                                + " ORDER BY title COLLATE NOCASE, id").fetchall()
        return [dict(row) for row in rows]

    def create(self, parent_id: Optional[int], title: object) -> Dict:
        title = clean_title(title)
        with self._db.transaction() as conn:
            if parent_id is not None:
                _live_folder(conn, parent_id)
            _check_free(conn, parent_id, title, None)
            cursor = conn.execute("INSERT INTO resource_folders (parent_id, title, created_at) VALUES (?, ?, ?)",
                                  (parent_id, title, self._clock()))
            return _folder(conn, cursor.lastrowid)

    def rename(self, folder_id: int, title: object) -> Dict:
        title = clean_title(title)
        with self._db.transaction() as conn:
            row = _live_folder(conn, folder_id)
            _check_free(conn, row["parent_id"], title, folder_id)
            conn.execute("UPDATE resource_folders SET title = ? WHERE id = ?", (title, folder_id))
            return _folder(conn, folder_id)

    def move(self, folder_id: int, parent_id: Optional[int]) -> Dict:
        """Into another folder (None: the top of Resources), never into itself or one inside it."""
        with self._db.transaction() as conn:
            row = _live_folder(conn, folder_id)
            if parent_id is not None:
                _live_folder(conn, parent_id)
                if parent_id in _subfolders(conn, folder_id):
                    raise WouldCycle("A folder cannot go into itself or a folder inside it")
            _check_free(conn, parent_id, row["title"], folder_id)
            conn.execute("UPDATE resource_folders SET parent_id = ? WHERE id = ?", (parent_id, folder_id))
            return _folder(conn, folder_id)

    def trash(self, folder_id: int) -> Dict:
        """Trashes the folder, the folders inside it and their notes (with the notes under
        them). Returns {folders: [ids], notes: [ids]}."""
        now = self._clock()
        with self._db.transaction() as conn:
            _live_folder(conn, folder_id)
            folders = _subfolders(conn, folder_id)
            notes = _notes_in(conn, folders)
            live = conn.execute("SELECT count(*) FROM notes WHERE " + _LIVE).fetchone()[0]
            if notes and live <= len(notes):
                raise LastNote("The last note cannot be deleted")
            conn.executemany("UPDATE resource_folders SET deleted_at = ? WHERE id = ?", [(now, each) for each in folders])
            conn.executemany("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?",
                             [(now, now, each) for each in notes])
        return {"folders": folders, "notes": notes}


def restore_folder_chain(conn: sqlite3.Connection, folder_id: Optional[int]) -> None:
    """A note back from the Trash brings back the folder it was in, and the folders above."""
    seen = set()
    while folder_id is not None and folder_id not in seen:
        seen.add(folder_id)
        row = conn.execute("SELECT parent_id FROM resource_folders WHERE id = ?", (folder_id,)).fetchone()
        if row is None:
            return
        conn.execute("UPDATE resource_folders SET deleted_at = NULL WHERE id = ?", (folder_id,))
        folder_id = row["parent_id"]


def purge_folders(conn: sqlite3.Connection, cutoff: str) -> int:
    """Deletes for good the folders trashed before cutoff that no note and no live folder
    point at (run after the notes' purge). Returns how many went."""
    removed = 0
    while True:
        rows = conn.execute(
            "SELECT id FROM resource_folders AS f WHERE deleted_at IS NOT NULL AND deleted_at <= ? "
            "AND NOT EXISTS (SELECT 1 FROM notes WHERE notes.folder_id = f.id) "
            "AND NOT EXISTS (SELECT 1 FROM resource_folders AS kid WHERE kid.parent_id = f.id)", (cutoff,)).fetchall()
        if not rows:
            return removed
        conn.executemany("DELETE FROM resource_folders WHERE id = ?", [(row["id"],) for row in rows])
        removed += len(rows)


def _folder(conn: sqlite3.Connection, folder_id: int) -> Dict:
    return dict(conn.execute("SELECT id, parent_id, title FROM resource_folders WHERE id = ?", (folder_id,)).fetchone())


def _live_folder(conn: sqlite3.Connection, folder_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM resource_folders WHERE id = ? AND " + _LIVE, (folder_id,)).fetchone()
    if row is None:
        raise NotFound("No such folder: {}".format(folder_id))
    return row


def _check_free(conn: sqlite3.Connection, parent_id: Optional[int], title: str, except_id: Optional[int]) -> None:
    row = conn.execute(
        "SELECT id FROM resource_folders WHERE ifnull(parent_id, 0) = ifnull(?, 0) AND title = ? COLLATE NOCASE "
        "AND id IS NOT ? AND " + _LIVE, (parent_id, title, except_id)).fetchone()
    if row is not None:
        raise TitleTaken("There is already a folder called {!r} there".format(title))


def _subfolders(conn: sqlite3.Connection, folder_id: int) -> List[int]:
    """The folder and every live folder inside it."""
    rows = conn.execute(
        "WITH RECURSIVE down(id) AS (SELECT ? UNION SELECT f.id FROM resource_folders AS f JOIN down "
        "ON f.parent_id = down.id WHERE f." + _LIVE + ") SELECT id FROM down", (folder_id,)).fetchall()
    return [row[0] for row in rows]


def _notes_in(conn: sqlite3.Connection, folders: List[int]) -> List[int]:
    """The live notes in these folders and every live note under them."""
    if not folders:
        return []
    marks = ",".join("?" * len(folders))
    # marks is only "?, ?, ...": the ids go in as parameters.
    rows = conn.execute(
        "WITH RECURSIVE down(id) AS (SELECT id FROM notes WHERE folder_id IN ({}) AND {} "
        "UNION SELECT notes.id FROM notes JOIN down ON notes.parent_id = down.id WHERE notes.{}) "
        "SELECT id FROM down".format(marks, _LIVE, _LIVE), folders).fetchall()
    return [row[0] for row in rows]

