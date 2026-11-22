"""Every read and write of decisions, questions and the people involved in them. The only
code that knows the decisions, questions and record_people tables. A record's title and
text are its note's (NoteRepository renames and saves them). It sits under a hub, or under a
meeting in a hub, which it then came from."""
import sqlite3
from typing import Callable, Dict, Iterable, List, Tuple

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, check_title_free, live_note_row, top_note_row, utc_now
from paradigm.db.people_repo import NotAHub, NotAPerson, person_row
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.records import BadKind, BadWhen, clean_day, clean_record_kind
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["RecordRepository", "NotARecord", "NotAQuestion", "HubArchived", "NotInvolved",
           "NotAnswered", "NotAHub", "NotAPerson", "BadKind", "BadWhen",
           "BadTitle", "NotFound"]

# Fixed table names by kind, never user input.
_TABLES = {"decision": "decisions", "question": "questions"}


class NotARecord(NoteError):
    pass


class NotAQuestion(NoteError):
    pass


class HubArchived(NoteError):
    """No new record goes into an archived hub."""


class NotInvolved(NoteError):
    pass


class NotAnswered(NoteError):
    pass


class RecordRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every decision and question whose note is live, with its live people."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT note_id, 'decision' AS kind, day, '' AS answered FROM decisions "
                "UNION ALL SELECT note_id, 'question', day, answered FROM questions "
                "ORDER BY note_id"
            ).fetchall()
            live = {row[0] for row in conn.execute("SELECT id FROM notes WHERE deleted_at IS NULL")}
            people = _people(conn)
        return [_record(row, people.get(row["note_id"], [])) for row in rows if row["note_id"] in live]

    def get(self, record_id: int) -> Dict:
        with self._db.reading() as conn:
            row = _record_row(conn, record_id)
            return _record(row, _people(conn, record_id).get(record_id, []))

    def create(self, parent_id: int, kind: object, title: object, day: object) -> Tuple[int, Dict]:
        """A new decision or question: a note called title under the parent (a hub, or a
        meeting in one), and its row. Returns (note id, record)."""
        kind, day, title = clean_record_kind(kind), clean_day(day), clean_title(title)
        now = self._clock()
        with self._db.transaction() as conn:
            _check_parent(conn, parent_id)
            check_title_free(conn, parent_id, title, None)
            note_id = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (?, ?, '', ?, ?)",
                (parent_id, title, now, now),
            ).lastrowid
            conn.execute("INSERT INTO {} (note_id, day) VALUES (?, ?)".format(_TABLES[kind]), (note_id, day))
        return note_id, self.get(note_id)

    def set_day(self, record_id: int, day: object) -> Dict:
        """The day it was decided, or asked."""
        day = clean_day(day)
        with self._db.transaction() as conn:
            row = _record_row(conn, record_id)
            conn.execute("UPDATE {} SET day = ? WHERE note_id = ?".format(_TABLES[row["kind"]]), (day, record_id))
        return self.get(record_id)

    def answer(self, question_id: int, day: object) -> Dict:
        """Marks a question answered on day (an answered one gets the new day)."""
        day = clean_day(day)
        with self._db.transaction() as conn:
            _question_row(conn, question_id)
            conn.execute("UPDATE questions SET answered = ? WHERE note_id = ?", (day, question_id))
        return self.get(question_id)

    def reopen(self, question_id: int) -> Dict:
        with self._db.transaction() as conn:
            row = _question_row(conn, question_id)
            if not row["answered"]:
                raise NotAnswered('"{}" is open already'.format(live_note_row(conn, question_id)["title"]))
            conn.execute("UPDATE questions SET answered = '' WHERE note_id = ?", (question_id,))
        return self.get(question_id)

    def involve(self, record_id: int, person_ids: Iterable[int]) -> Tuple[Dict, List[int]]:
        """Puts people on a record. Returns (record, the ids that were not on it before)."""
        with self._db.transaction() as conn:
            _record_row(conn, record_id)
            added = []
            for person_id in person_ids:
                person_row(conn, person_id)
                done = conn.execute(
                    "INSERT OR IGNORE INTO record_people (note_id, person_id) VALUES (?, ?)",
                    (record_id, person_id),
                ).rowcount
                if done:
                    added.append(person_id)
        return self.get(record_id), added

    def uninvolve(self, record_id: int, person_id: int) -> Dict:
        with self._db.transaction() as conn:
            _record_row(conn, record_id)
            record = live_note_row(conn, record_id)
            person = live_note_row(conn, person_id)
            gone = conn.execute("DELETE FROM record_people WHERE note_id = ? AND person_id = ?",
                                (record_id, person_id)).rowcount
            if not gone:
                raise NotInvolved('"{}" is not on "{}"'.format(person["title"], record["title"]))
        return self.get(record_id)


def _record(row: sqlite3.Row, people: List[int]) -> Dict:
    record = {"id": row["note_id"], "kind": row["kind"], "day": row["day"], "people": people}
    if row["kind"] == "question":
        record["answered"] = row["answered"]
    return record


def _people(conn: sqlite3.Connection, record_id=None) -> Dict[int, List[int]]:
    """{record id: [person ids]}, only people whose note is live."""
    rows = conn.execute(
        "SELECT record_people.* FROM record_people JOIN notes ON notes.id = record_people.person_id "
        "WHERE notes.deleted_at IS NULL AND (? IS NULL OR note_id = ?) ORDER BY person_id",
        (record_id, record_id),
    ).fetchall()
    found: Dict[int, List[int]] = {}
    for row in rows:
        found.setdefault(row["note_id"], []).append(row["person_id"])
    return found


def _record_row(conn: sqlite3.Connection, record_id: int) -> sqlite3.Row:
    note = live_note_row(conn, record_id)
    row = conn.execute(
        "SELECT note_id, 'decision' AS kind, day, '' AS answered FROM decisions WHERE note_id = ? "
        "UNION ALL SELECT note_id, 'question', day, answered FROM questions WHERE note_id = ?",
        (record_id, record_id),
    ).fetchone()
    if row is None:
        raise NotARecord('"{}" is not a decision or a question'.format(note["title"]))
    return row


def _question_row(conn: sqlite3.Connection, question_id: int) -> sqlite3.Row:
    row = _record_row(conn, question_id)
    if row["kind"] != "question":
        raise NotAQuestion('"{}" is a decision, not a question'.format(live_note_row(conn, question_id)["title"]))
    return row


def _check_parent(conn: sqlite3.Connection, parent_id: int) -> None:
    """A record goes under a live hub, or under a meeting in one."""
    parent = live_note_row(conn, parent_id)
    top = top_note_row(conn, parent_id)
    is_hub = parent["parent_id"] is None and not parent["is_person"] and parent["kind"] in HUB_KINDS
    in_hub = not top["is_person"] and top["kind"] in HUB_KINDS
    if not (is_hub or (parent["is_meeting"] and in_hub)):
        raise NotAHub('"{}" is not a hub or a meeting: decisions and questions go in a project, '
                      'an area or a resource'.format(parent["title"]))
    if top["archived_at"] is not None:
        raise HubArchived('"{}" is archived (:restore it first)'.format(top["title"]))
