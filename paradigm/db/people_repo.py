"""Every read and write of people and their hub links. The only code that knows the people
and hub_people tables. A person's note title is their name, "First Last": changing the first
or last name renames the note."""
import sqlite3
from typing import Callable, Dict, List, Tuple

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, check_title_free, live_note_row, utc_now
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.people import NAME_FIELDS, BadField, clean_field, clean_role, full_name, split_name
from paradigm.notes.titles import clean_title

Clock = Callable[[], str]

__all__ = ["PeopleRepository", "NotAPerson", "NotAHub", "NotLinked", "BadField", "NotFound"]


class NotAPerson(NoteError):
    pass


class NotAHub(NoteError):
    """People go on a hub: a top-level project, area or resource."""


class NotLinked(NoteError):
    pass


class PeopleRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every person whose note is live, with their links (the hub may be any note: the
        reader shows only links whose hub is a hub now)."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT people.* FROM people JOIN notes ON notes.id = people.note_id "
                "WHERE notes.deleted_at IS NULL ORDER BY people.note_id"
            ).fetchall()
            links = _links(conn)
        return [_person(row, links.get(row["note_id"], [])) for row in rows]

    def get(self, person_id: int) -> Dict:
        with self._db.reading() as conn:
            row = _person_row(conn, person_id)
            return _person(row, _links(conn, person_id).get(person_id, []))

    def create(self, name: object = None, first: object = None, last: object = None) -> Tuple[int, Dict]:
        """A new person: a top-level note called "First Last", and their row. Give the name
        (split at its first space) or the first and last names. Returns (note id, person)."""
        if first is None and last is None:
            first, last = split_name(clean_title(name))
        first, last = clean_field("first", first or ""), clean_field("last", last or "")
        title = clean_title(full_name(first, last))
        now = self._clock()
        with self._db.transaction() as conn:
            check_title_free(conn, None, title, None)
            note_id = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (NULL, ?, '', ?, ?)",
                (title, now, now),
            ).lastrowid
            conn.execute("INSERT INTO people (note_id, first, last) VALUES (?, ?, ?)", (note_id, first, last))
        return note_id, self.get(note_id)

    def update(self, person_id: int, field: object, value: object) -> Dict:
        """Sets one field; a first or last name renames the note too."""
        value = clean_field(field, value)
        with self._db.transaction() as conn:
            row = _person_row(conn, person_id)
            if field in NAME_FIELDS:
                names = {"first": row["first"], "last": row["last"], field: value}
                title = clean_title(full_name(names["first"], names["last"]))
                check_title_free(conn, None, title, person_id)
                conn.execute("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?", (title, self._clock(), person_id))
            # field is one of PERSON_FIELDS (clean_field checked), never other input.
            conn.execute("UPDATE people SET {} = ? WHERE note_id = ?".format(field), (value, person_id))
        return self.get(person_id)

    def link(self, hub_id: int, person_id: int, role: object) -> Tuple[Dict, bool]:
        """Puts a person on a hub with a role, or changes the role. Returns (person, whether
        the link is new)."""
        role = clean_role(role)
        with self._db.transaction() as conn:
            _person_row(conn, person_id)
            _hub_row(conn, hub_id)
            new = conn.execute("SELECT 1 FROM hub_people WHERE hub_id = ? AND person_id = ?",
                               (hub_id, person_id)).fetchone() is None
            conn.execute(
                "INSERT INTO hub_people (hub_id, person_id, role) VALUES (?, ?, ?) "
                "ON CONFLICT (hub_id, person_id) DO UPDATE SET role = excluded.role",
                (hub_id, person_id, role),
            )
        return self.get(person_id), new

    def unlink(self, hub_id: int, person_id: int) -> Dict:
        with self._db.transaction() as conn:
            row = _person_row(conn, person_id)
            hub = live_note_row(conn, hub_id)
            gone = conn.execute("DELETE FROM hub_people WHERE hub_id = ? AND person_id = ?",
                                (hub_id, person_id)).rowcount
            if not gone:
                raise NotLinked('"{}" is not on "{}"'.format(_title(conn, row["note_id"]), hub["title"]))
        return self.get(person_id)


def _person(row: sqlite3.Row, links: List[Dict]) -> Dict:
    return {"id": row["note_id"], "first": row["first"], "last": row["last"], "email": row["email"],
            "phone": row["phone"], "org": row["org"], "job": row["job"], "hubs": links}


def _links(conn: sqlite3.Connection, person_id=None) -> Dict[int, List[Dict]]:
    """{person id: [{hub_id, role}]}, only links whose hub note is live."""
    rows = conn.execute(
        "SELECT hub_people.* FROM hub_people JOIN notes ON notes.id = hub_people.hub_id "
        "WHERE notes.deleted_at IS NULL AND (? IS NULL OR person_id = ?) ORDER BY hub_id",
        (person_id, person_id),
    ).fetchall()
    found: Dict[int, List[Dict]] = {}
    for row in rows:
        found.setdefault(row["person_id"], []).append({"hub_id": row["hub_id"], "role": row["role"]})
    return found


def _person_row(conn: sqlite3.Connection, person_id: int) -> sqlite3.Row:
    note = live_note_row(conn, person_id)
    row = conn.execute("SELECT * FROM people WHERE note_id = ?", (person_id,)).fetchone()
    if row is None:
        raise NotAPerson('"{}" is not a person'.format(note["title"]))
    return row


def _hub_row(conn: sqlite3.Connection, hub_id: int) -> sqlite3.Row:
    hub = live_note_row(conn, hub_id)
    if hub["is_person"] or hub["parent_id"] is not None or hub["kind"] not in HUB_KINDS:
        raise NotAHub('"{}" is not a hub: people go on a project, an area or a resource'.format(hub["title"]))
    return hub


def _title(conn: sqlite3.Connection, note_id: int) -> str:
    return conn.execute("SELECT title FROM notes WHERE id = ?", (note_id,)).fetchone()[0]


# For the other repositories that check people and hubs inside their own transactions.
person_row = _person_row
