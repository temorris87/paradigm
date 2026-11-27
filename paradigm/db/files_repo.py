"""OneDrive folders linked to hubs, their files, and which notes each file is attached to
(020_files.sql). The only code that knows the file_folders, files and file_links tables.

A folder is read again when asked (scan): new files get rows, files gone from disk are
marked missing (kept while a note still has them attached, else dropped), and files that
come back are found again."""
import sqlite3
from pathlib import Path
from typing import Callable, Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, live_note_row, top_note_row, utc_now
from paradigm.files import folders as disk
from paradigm.files.folders import BadFolder, clean_file, clean_folder, inside, list_files
from paradigm.notes.hubs import HUB_KINDS

Clock = Callable[[], str]
Opener = Callable[[Path], None]

__all__ = ["FileRepository", "NotFound", "BadFolder", "NotAHub", "FolderLinked", "NotLinked"]


class NotAHub(NoteError):
    pass


class FolderLinked(NoteError):
    pass


class NotLinked(NoteError):
    """A file in no linked folder; folder is its own folder, to offer to link."""

    def __init__(self, folder: str):
        super().__init__("not in a linked folder")
        self.folder = folder


class FileRepository:
    def __init__(self, db: Database, clock: Clock = utc_now, opener: Optional[Opener] = None):
        self._db = db
        self._clock = clock
        self._opener = opener

    def all(self) -> Dict[str, List[Dict]]:
        """Every folder on a live hub (with `trashed`: its files' attachments to notes in the
        trash), its files, and every attachment to a live note."""
        with self._db.reading() as conn:
            folders = conn.execute(
                "SELECT file_folders.* FROM file_folders JOIN notes ON notes.id = file_folders.note_id "
                "WHERE notes.deleted_at IS NULL ORDER BY file_folders.id").fetchall()
            ids = {row["id"] for row in folders}
            files = [row for row in conn.execute("SELECT * FROM files ORDER BY folder_id, rel_path") if row["folder_id"] in ids]
            links = conn.execute(
                "SELECT file_links.* FROM file_links JOIN notes ON notes.id = file_links.note_id "
                "WHERE notes.deleted_at IS NULL ORDER BY file_links.added_at, file_links.file_id").fetchall()
            # Attachments on notes in the trash are hidden above, but unlinking a folder drops
            # them too, so its confirm must be able to say how many there are.
            trashed = dict(conn.execute(
                "SELECT files.folder_id, COUNT(*) FROM file_links JOIN files ON files.id = file_links.file_id "
                "JOIN notes ON notes.id = file_links.note_id WHERE notes.deleted_at IS NOT NULL "
                "GROUP BY files.folder_id").fetchall())
        file_ids = {row["id"] for row in files}
        return {"folders": [dict(_folder(row), trashed=trashed.get(row["id"], 0)) for row in folders], "files": [_file(row) for row in files],
                "links": [{"file_id": row["file_id"], "note_id": row["note_id"], "added_at": row["added_at"]}
                          for row in links if row["file_id"] in file_ids]}

    def link_folder(self, note_id: int, raw_path: object) -> Dict:
        """Links a folder on this computer to a hub, and reads it."""
        path = clean_folder(raw_path)
        with self._db.transaction() as conn:
            _hub_row(conn, note_id)
            taken = conn.execute("SELECT 1 FROM file_folders WHERE note_id = ? AND path = ?", (note_id, str(path))).fetchone()
            if taken:
                raise FolderLinked("That folder is linked here already")
            folder_id = conn.execute("INSERT INTO file_folders (note_id, path, created_at) VALUES (?, ?, ?)",
                                     (note_id, str(path), self._clock())).lastrowid
        return self.scan(folder_id)

    def pick_start(self, note_id: int) -> Dict:
        """{title, folder} for a hub's file dialog: folder is its oldest linked folder still on
        disk, else None."""
        with self._db.reading() as conn:
            hub = _hub_row(conn, note_id, "Files are added on a project or an area")
            paths = [row["path"] for row in conn.execute(
                "SELECT path FROM file_folders WHERE note_id = ? ORDER BY created_at, id", (note_id,))]
        folder = next((path for path in paths if Path(path).is_dir()), None)
        return {"title": hub["title"], "folder": folder}

    def attach_path(self, note_id: int, raw_path: object) -> Dict:
        """Attaches the file at an absolute path to a note, through the linked folder holding
        it (on any live hub). Returns {file, link}; a file the note has already gives its
        existing link. NotLinked when no linked folder holds it."""
        path = clean_file(raw_path)
        with self._db.reading() as conn:
            note = live_note_row(conn, note_id)
            if note["is_template"]:
                raise NotAHub("A template holds no files")
            folders = conn.execute(
                "SELECT file_folders.* FROM file_folders JOIN notes ON notes.id = file_folders.note_id "
                "WHERE notes.deleted_at IS NULL ORDER BY file_folders.id").fetchall()
        folder, rel_path = _holder(folders, path, note_id)
        self.scan(folder["id"])
        with self._db.transaction() as conn:
            row = conn.execute("SELECT * FROM files WHERE folder_id = ? AND rel_path = ?",
                               (folder["id"], rel_path)).fetchone()
            if row is None:
                raise BadFolder('Paradigm does not list "{}" (a hidden or lock file, or too deep)'.format(path.name))
            live_note_row(conn, note_id)
            conn.execute("INSERT OR IGNORE INTO file_links (file_id, note_id, added_at) VALUES (?, ?, ?)",
                         (row["id"], note_id, self._clock()))
            link = conn.execute("SELECT * FROM file_links WHERE file_id = ? AND note_id = ?", (row["id"], note_id)).fetchone()
            return {"file": _file(row), "link": {"file_id": link["file_id"], "note_id": link["note_id"],
                                                 "added_at": link["added_at"]}}

    def unlink_folder(self, folder_id: int) -> None:
        """Unlinks a folder: its files leave the notes they were attached to (nothing on disk
        changes)."""
        with self._db.transaction() as conn:
            _folder_row(conn, folder_id)
            conn.execute("DELETE FROM file_links WHERE file_id IN (SELECT id FROM files WHERE folder_id = ?)", (folder_id,))
            conn.execute("DELETE FROM files WHERE folder_id = ?", (folder_id,))
            conn.execute("DELETE FROM file_folders WHERE id = ?", (folder_id,))

    def scan(self, folder_id: int) -> Dict:
        """Reads the folder again. Returns {folder, added, missing}."""
        with self._db.reading() as conn:
            folder = _folder_row(conn, folder_id)
        path = Path(folder["path"])
        on_disk = list_files(path) if path.is_dir() else []
        with self._db.transaction() as conn:
            known = {row["rel_path"]: row for row in conn.execute("SELECT * FROM files WHERE folder_id = ?", (folder_id,))}
            seen = set()
            added = 0
            for entry in on_disk:
                seen.add(entry["rel_path"])
                if entry["rel_path"] in known:
                    conn.execute("UPDATE files SET size = ?, modified = ?, missing = 0 WHERE id = ?",
                                 (entry["size"], entry["modified"], known[entry["rel_path"]]["id"]))
                else:
                    conn.execute("INSERT INTO files (folder_id, rel_path, name, size, modified) VALUES (?, ?, ?, ?, ?)",
                                 (folder_id, entry["rel_path"], entry["name"], entry["size"], entry["modified"]))
                    added += 1
            missing = 0
            for rel_path, row in known.items():
                if rel_path in seen:
                    continue
                attached = conn.execute("SELECT 1 FROM file_links WHERE file_id = ? LIMIT 1", (row["id"],)).fetchone()
                if attached:
                    conn.execute("UPDATE files SET missing = 1 WHERE id = ?", (row["id"],))
                    missing += 1
                else:
                    conn.execute("DELETE FROM files WHERE id = ?", (row["id"],))
            conn.execute("UPDATE file_folders SET scanned_at = ? WHERE id = ?", (self._clock(), folder_id))
            return {"folder": _folder(_folder_row(conn, folder_id)), "added": added, "missing": missing}

    def attach(self, file_id: int, note_id: int) -> Dict:
        with self._db.transaction() as conn:
            _file_row(conn, file_id)
            note = live_note_row(conn, note_id)
            if note["is_template"]:
                raise NotAHub("A template holds no files")
            conn.execute("INSERT OR IGNORE INTO file_links (file_id, note_id, added_at) VALUES (?, ?, ?)",
                         (file_id, note_id, self._clock()))
            return _file(_file_row(conn, file_id))

    def detach(self, file_id: int, note_id: int) -> None:
        with self._db.transaction() as conn:
            row = _file_row(conn, file_id)
            conn.execute("DELETE FROM file_links WHERE file_id = ? AND note_id = ?", (file_id, note_id))
            # A file gone from its folder, and now attached nowhere, is forgotten.
            if row["missing"] and not conn.execute("SELECT 1 FROM file_links WHERE file_id = ?", (file_id,)).fetchone():
                conn.execute("DELETE FROM files WHERE id = ?", (file_id,))

    def open(self, file_id: int) -> None:
        """Opens the file on this computer."""
        with self._db.reading() as conn:
            row = _file_row(conn, file_id)
            folder = _folder_row(conn, row["folder_id"])
        # Looked up when used, so a test can stand in for the program that opens it.
        (self._opener or disk.open_file)(inside(Path(folder["path"]), row["rel_path"]))

    def path_of(self, file_id: int) -> str:
        with self._db.reading() as conn:
            row = _file_row(conn, file_id)
            folder = _folder_row(conn, row["folder_id"])
        return str(inside(Path(folder["path"]), row["rel_path"]))


def _hub_row(conn: sqlite3.Connection, note_id: int, refusal: str = "A folder is linked to a project or an area") -> sqlite3.Row:
    hub = top_note_row(conn, note_id)
    if hub["id"] != note_id or hub["is_person"] or hub["is_template"] or hub["kind"] not in HUB_KINDS:
        raise NotAHub(refusal)
    return hub


def _holder(folders: List[sqlite3.Row], path: Path, note_id: int):
    """(folder row, rel_path) of the linked folder holding path: one on this note first, then
    the nearest (the deepest, when linked folders nest)."""
    found = []
    for row in folders:
        base = Path(row["path"]).resolve()
        if base not in path.parents:
            continue
        rel_path = path.relative_to(base).as_posix()
        inside(base, rel_path)  # refuses anything that would leave the folder
        found.append((row["note_id"] != note_id, -len(base.parts), row["id"], row, rel_path))
    if not found:
        raise NotLinked(str(path.parent))
    best = min(found, key=lambda entry: entry[:3])
    return best[3], best[4]


def _folder(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "note_id": row["note_id"], "path": row["path"], "name": Path(row["path"]).name or row["path"],
            "scanned_at": row["scanned_at"]}


def _file(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "folder_id": row["folder_id"], "rel_path": row["rel_path"], "name": row["name"],
            "size": row["size"], "modified": row["modified"], "missing": bool(row["missing"])}


def _folder_row(conn: sqlite3.Connection, folder_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM file_folders WHERE id = ?", (folder_id,)).fetchone()
    if row is None:
        raise NotFound("No such folder: {}".format(folder_id))
    return row


def _file_row(conn: sqlite3.Connection, file_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if row is None:
        raise NotFound("No such file: {}".format(file_id))
    return row
