"""Every read and write of notes. The only code that knows the notes table."""
import sqlite3
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Tuple

from paradigm.db.connection import Database
from paradigm.db.links_repo import store_links
from paradigm.notes.hubs import HUB_KINDS, BadKind, clean_kind
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["NoteRepository", "NoteError", "NotFound", "Conflict", "TitleTaken", "BadTitle",
           "HasChildren", "WouldCycle", "LastNote", "BadKind", "NotAProject", "NotAnArea",
           "NotTopLevel", "NotArchived", "AreaArchived", "IsAPerson", "StaysInAHub",
           "live_note_row", "check_title_free", "top_note_row"]


class NoteError(Exception):
    pass


class NotFound(NoteError):
    pass


class Conflict(NoteError):
    """The note changed since the version a save started from (another tab saved it)."""

    def __init__(self, current_version: int):
        super().__init__("The note was changed in another tab")
        self.current_version = current_version


class TitleTaken(NoteError):
    pass


class HasChildren(NoteError):
    pass


class WouldCycle(NoteError):
    pass


class LastNote(NoteError):
    """The tree is never left empty."""


class NotAProject(NoteError):
    """Only a project belongs to an area."""


class NotAnArea(NoteError):
    """A project can only be put in an area."""


class NotTopLevel(NoteError):
    """Only a whole hub (a top-level note) is archived, never a note inside one."""


class NotArchived(NoteError):
    pass


class AreaArchived(NoteError):
    """A project is never put in an archived area."""


class IsAPerson(NoteError):
    """A person's note stays at the top level and is never filed as a hub."""


class StaysInAHub(NoteError):
    """A meeting's, decision's or question's note stays inside a hub: never at the top
    level, never filed."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


_LIVE = "deleted_at IS NULL"
# A note with a people row is a person (006_people.sql), one with a meetings row a meeting
# (007_meetings.sql), one with a decisions or questions row a decision or a question
# (008_decisions.sql): the is_* columns say so.
_WITH_PERSON = ("SELECT notes.*, people.note_id IS NOT NULL AS is_person, "
                "meetings.note_id IS NOT NULL AS is_meeting, "
                "decisions.note_id IS NOT NULL AS is_decision, "
                "questions.note_id IS NOT NULL AS is_question FROM notes "
                "LEFT JOIN people ON people.note_id = notes.id "
                "LEFT JOIN meetings ON meetings.note_id = notes.id "
                "LEFT JOIN decisions ON decisions.note_id = notes.id "
                "LEFT JOIN questions ON questions.note_id = notes.id")


class NoteRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def tree(self) -> List[Dict]:
        """Every live note without its body: enough to draw the tree and resolve links."""
        with self._db.reading() as conn:
            rows = conn.execute(
                _WITH_PERSON + " WHERE " + _LIVE + " ORDER BY title COLLATE NOCASE, id"
            ).fetchall()
        return [_summary(row) for row in rows]

    def all_bodies(self) -> List[str]:
        """The text of every note, trashed ones too (a note back from the trash keeps its links)."""
        with self._db.reading() as conn:
            return [row[0] for row in conn.execute("SELECT body FROM notes").fetchall()]

    def count(self) -> int:
        with self._db.reading() as conn:
            return conn.execute("SELECT count(*) FROM notes WHERE " + _LIVE).fetchone()[0]

    def get(self, note_id: int) -> Dict:
        with self._db.reading() as conn:
            row = _live_row(conn, note_id)
        return dict(_summary(row), body=row["body"], created_at=row["created_at"])

    def create(self, parent_id: Optional[int], title: object, body: str = "",
               links: Optional[List[str]] = None) -> Dict:
        """links: the wiki-link texts in body (009_links.sql); None leaves them to be read
        later (the note is stale until then)."""
        title = clean_title(title)
        now = self._clock()
        with self._db.transaction() as conn:
            if parent_id is not None:
                _live_row(conn, parent_id)
            _check_free(conn, parent_id, title, None)
            cursor = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (parent_id, title, body, now, now),
            )
            note_id = cursor.lastrowid
            if links is not None:
                store_links(conn, note_id, 1, links)
        return self.get(note_id)

    def save(self, note_id: int, body: str, base_version: int, force: bool = False,
             links: Optional[List[str]] = None) -> Dict:
        """links: as for create, stored with the version the note ends on."""
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if row["version"] != base_version and not force:
                raise Conflict(row["version"])
            version = row["version"]
            if row["body"] != body:
                self._change(conn, note_id, "body = ?, version = version + 1", (body,))
                version += 1
            if links is not None:
                store_links(conn, note_id, version, links)
        return self.get(note_id)

    def rename(self, note_id: int, title: object) -> Dict:
        title = clean_title(title)
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            _check_free(conn, row["parent_id"], title, note_id)
            self._change(conn, note_id, "title = ?", (title,))
        return self.get(note_id)

    def move(self, note_id: int, parent_id: Optional[int]) -> Dict:
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if parent_id is not None and row["is_person"]:
                raise IsAPerson('"{}" is a person: a person stays at the top level'.format(row["title"]))
            if _in_hub_only(row):
                _check_hub_place(conn, row, parent_id)
            if parent_id is not None:
                _live_row(conn, parent_id)
                if parent_id == note_id or note_id in _ancestors(conn, parent_id):
                    raise WouldCycle("A note cannot go under itself or under a note inside it")
            _check_free(conn, parent_id, row["title"], note_id)
            # Only top-level notes are hubs: going under another note leaves its group.
            # Only top-level notes are archived: under another note, it shares that one's state.
            if parent_id is not None:
                self._change(conn, note_id, "parent_id = ?, kind = NULL, archived_at = NULL", (parent_id,))
                _drop_area_links(conn, note_id)
            else:
                self._change(conn, note_id, "parent_id = ?", (parent_id,))
        return self.get(note_id)

    def set_kind(self, note_id: int, kind: object) -> Dict:
        """Files a note as a project, area or resource (None: the Inbox). A nested note moves
        to the top level first, since only top-level notes are hubs."""
        kind = clean_kind(kind)
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if row["is_person"]:
                raise IsAPerson('"{}" is a person, not a note to file'.format(row["title"]))
            if _in_hub_only(row):
                raise StaysInAHub('"{}" is a {}: it stays inside its hub'.format(row["title"], _kind(row)))
            if row["parent_id"] is not None:
                _check_free(conn, None, row["title"], note_id)
                self._change(conn, note_id, "parent_id = NULL", ())
            self._change(conn, note_id, "kind = ?", (kind,))
            if kind != "project":
                conn.execute("UPDATE notes SET area_id = NULL WHERE id = ?", (note_id,))
            if kind != "area":
                conn.execute("UPDATE notes SET area_id = NULL WHERE area_id = ?", (note_id,))
        return self.get(note_id)

    def set_area(self, note_id: int, area_id: Optional[int]) -> Dict:
        """Puts a project in an area (None: in no area)."""
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if row["kind"] != "project" or row["parent_id"] is not None:
                raise NotAProject('"{}" is not a project: only a project goes in an area'.format(row["title"]))
            if area_id is not None:
                area = _live_row(conn, area_id)
                if area["kind"] != "area" or area["parent_id"] is not None:
                    what = _what_it_is(area)
                    raise NotAnArea('"{}" is {}, not an area'.format(area["title"], what))
                if area["archived_at"] is not None:
                    raise AreaArchived('"{}" is archived (:restore it first)'.format(area["title"]))
            self._change(conn, note_id, "area_id = ?", (area_id,))
        return self.get(note_id)

    def set_archived(self, note_id: int, archived: bool) -> Tuple[Dict, int]:
        """Archives a hub with everything under it, or restores it. The kind and area link are
        kept, so it goes back to its group. Returns the note and how many notes are under it."""
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if row["parent_id"] is not None:
                raise NotTopLevel('Only a whole hub is archived: "{}" is inside one'.format(row["title"]))
            if not archived and row["archived_at"] is None:
                raise NotArchived('"{}" is not archived'.format(row["title"]))
            if archived and row["archived_at"] is None:
                self._change(conn, note_id, "archived_at = ?", (self._clock(),))
            elif not archived:
                self._change(conn, note_id, "archived_at = NULL", ())
            inside = len(_subtree(conn, note_id)) - 1
        return self.get(note_id), inside

    def delete(self, note_id: int, recursive: bool = False) -> List[int]:
        """Marks the note (and, if recursive, everything under it) deleted. Returns the ids."""
        now = self._clock()
        with self._db.transaction() as conn:
            _live_row(conn, note_id)
            ids = _subtree(conn, note_id)
            if len(ids) > 1 and not recursive:
                raise HasChildren("The note has notes under it: :trash! deletes them too")
            live = conn.execute("SELECT count(*) FROM notes WHERE " + _LIVE).fetchone()[0]
            if live <= len(ids):
                raise LastNote("The last note cannot be deleted")
            conn.executemany(
                "UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?",
                [(now, now, each) for each in ids],
            )
        return ids

    def _change(self, conn: sqlite3.Connection, note_id: int, assignment: str, values: tuple) -> None:
        # assignment is one of the fixed snippets above, never user input.
        conn.execute(
            "UPDATE notes SET {}, updated_at = ? WHERE id = ?".format(assignment),
            values + (self._clock(), note_id),
        )


def _summary(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "parent_id": row["parent_id"], "title": row["title"],
            "kind": _kind(row), "area_id": row["area_id"], "archived_at": row["archived_at"],
            "version": row["version"],
            "updated_at": row["updated_at"]}


# The record kinds a note can carry, besides being a person.
_RECORD_KINDS = ("meeting", "decision", "question")


def _kind(row: sqlite3.Row) -> Optional[str]:
    if row["is_person"]:
        return "person"
    return next((kind for kind in _RECORD_KINDS if row["is_" + kind]), row["kind"])


def _in_hub_only(row: sqlite3.Row) -> bool:
    return _kind(row) in _RECORD_KINDS


def _check_hub_place(conn: sqlite3.Connection, row: sqlite3.Row, parent_id: Optional[int]) -> None:
    """A meeting, decision or question may move anywhere inside a hub (its hub then
    changes), nowhere else."""
    top = None if parent_id is None else _top_row(conn, parent_id)
    if top is None or top["is_person"] or top["kind"] not in HUB_KINDS:
        raise StaysInAHub('"{}" is a {}: it goes inside a project, an area or a resource'.format(
            row["title"], _kind(row)))


def _top_row(conn: sqlite3.Connection, note_id: int) -> sqlite3.Row:
    """The top-level note holding a note (the note itself at the top)."""
    row = _live_row(conn, note_id)
    while row["parent_id"] is not None:
        row = _live_row(conn, row["parent_id"])
    return row


def _what_it_is(row: sqlite3.Row) -> str:
    if row["is_person"] or _in_hub_only(row):
        return "a " + _kind(row)
    return "a " + row["kind"] if row["kind"] else "in the Inbox"


def _drop_area_links(conn: sqlite3.Connection, note_id: int) -> None:
    """A note that stops being a hub leaves its area, and no project stays in it."""
    conn.execute("UPDATE notes SET area_id = NULL WHERE id = ? OR area_id = ?", (note_id, note_id))


def _live_row(conn: sqlite3.Connection, note_id: int) -> sqlite3.Row:
    row = conn.execute(_WITH_PERSON + " WHERE id = ? AND " + _LIVE, (note_id,)).fetchone()
    if row is None:
        raise NotFound("No such note: {}".format(note_id))
    return row


def _check_free(conn: sqlite3.Connection, parent_id: Optional[int], title: str,
                except_id: Optional[int]) -> None:
    row = conn.execute(
        "SELECT id FROM notes WHERE ifnull(parent_id, 0) = ifnull(?, 0) AND title = ? COLLATE NOCASE "
        "AND id IS NOT ? AND " + _LIVE,
        (parent_id, title, except_id),
    ).fetchone()
    if row is not None:
        raise TitleTaken("There is already a note called {!r} there".format(title))


def _ancestors(conn: sqlite3.Connection, note_id: int) -> List[int]:
    rows = conn.execute(
        "WITH RECURSIVE up(id) AS (SELECT parent_id FROM notes WHERE id = ? "
        "UNION SELECT notes.parent_id FROM notes JOIN up ON notes.id = up.id) "
        "SELECT id FROM up WHERE id IS NOT NULL",
        (note_id,),
    ).fetchall()
    return [row[0] for row in rows]


def _subtree(conn: sqlite3.Connection, note_id: int) -> List[int]:
    rows = conn.execute(
        "WITH RECURSIVE down(id) AS (SELECT ? UNION SELECT notes.id FROM notes JOIN down "
        "ON notes.parent_id = down.id WHERE notes." + _LIVE + ") SELECT id FROM down",
        (note_id,),
    ).fetchall()
    return [row[0] for row in rows]


# For the other repositories that make or check notes inside their own transactions.
live_note_row = _live_row
check_title_free = _check_free
top_note_row = _top_row
