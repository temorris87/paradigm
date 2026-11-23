"""Every read and write of decisions, questions and the people involved in them. The only
code that knows the decisions, questions, record_people and record_sources tables. A
record's title and text are its note's (NoteRepository renames and saves them). It sits
directly under its hub and remembers where it came from: the note or meeting it was made in
(source), and the text it was made from there (quote). Records may share titles."""
import sqlite3
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, live_note_row, top_note_row, utc_now
from paradigm.db.people_repo import NotAHub, NotAPerson, person_row
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.records import BadKind, BadWhen, clean_day, clean_record_kind
from paradigm.notes.titles import BadTitle, clean_title

MAX_QUOTE_LENGTH = 5000
MAX_ANSWER_LENGTH = 20000

Clock = Callable[[], str]

__all__ = ["insert_record", "RecordRepository", "NotARecord", "NotAQuestion", "HubArchived", "NotInvolved",
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
        """Every decision and question whose note is live, with its live people and source."""
        with self._db.reading() as conn:
            rows = conn.execute(_ROWS + " ORDER BY note_id").fetchall()
            live = {row[0] for row in conn.execute("SELECT id FROM notes WHERE deleted_at IS NULL")}
            people = _people(conn)
        return [_record(row, people.get(row["note_id"], [])) for row in rows if row["note_id"] in live]

    def get(self, record_id: int) -> Dict:
        with self._db.reading() as conn:
            row = _record_row(conn, record_id)
            return _record(row, _people(conn, record_id).get(record_id, []))

    def create(self, owner_id: int, kind: object, title: object, day: object,
               source_id: Optional[int] = None, quote: object = "") -> Tuple[int, Dict]:
        """A new decision or question: a note called title directly under the hub of owner
        (a hub, or a note or meeting in one), and its row. It came from source (default: the
        owner, when that is not the hub itself), made from the text quote there. Returns
        (note id, record)."""
        kind, day, title = clean_record_kind(kind), clean_day(day), clean_title(title)
        quote = _clean_quote(quote)
        now = self._clock()
        with self._db.transaction() as conn:
            hub = _check_owner(conn, owner_id)
            if source_id is None and owner_id != hub["id"]:
                source_id = owner_id
            if source_id is not None and top_note_row(conn, source_id)["id"] != hub["id"]:
                raise NotAHub('A record comes from a note in its own hub, "{}"'.format(hub["title"]))
            note_id = insert_record(conn, hub["id"], kind, title, day, source_id, quote, now)
        return note_id, self.get(note_id)

    def set_day(self, record_id: int, day: object) -> Dict:
        """The day it was decided, or asked."""
        day = clean_day(day)
        with self._db.transaction() as conn:
            row = _record_row(conn, record_id)
            conn.execute("UPDATE {} SET day = ? WHERE note_id = ?".format(_TABLES[row["kind"]]), (day, record_id))
        return self.get(record_id)

    def answer(self, question_id: int, day: object, text: object = "") -> Dict:
        """Marks a question answered on day (an answered one gets the new day). text, when
        given, is added at the end of the question's note: its Answer field."""
        day = clean_day(day)
        if not isinstance(text, str) or len(text) > MAX_ANSWER_LENGTH:
            raise BadTitle("The answer must be text of at most {} characters".format(MAX_ANSWER_LENGTH))
        text = text.strip()
        with self._db.transaction() as conn:
            _question_row(conn, question_id)
            conn.execute("UPDATE questions SET answered = ? WHERE note_id = ?", (day, question_id))
            if text:
                body = live_note_row(conn, question_id)["body"].rstrip()
                conn.execute("UPDATE notes SET body = ?, version = version + 1, updated_at = ? WHERE id = ?",
                             ((body + "\n\n" if body else "") + text + "\n", self._clock(), question_id))
        return self.get(question_id)

    def to_decision(self, question_id: int, day: object) -> Dict:
        """Turn into decision: the question becomes a decision decided on day, keeping its note
        (title, text, people, where it came from); its answer text is now the decision's why."""
        day = clean_day(day)
        with self._db.transaction() as conn:
            _question_row(conn, question_id)
            conn.execute("DELETE FROM questions WHERE note_id = ?", (question_id,))
            conn.execute("INSERT INTO decisions (note_id, day) VALUES (?, ?)", (question_id, day))
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


# Each record with its source, and whether the quote is still in the source's text.
_ROWS = (
    "SELECT kinds.*, record_sources.source_id, ifnull(record_sources.quote, '') AS quote, "
    "(record_sources.quote != '' AND (instr(source.body, record_sources.quote) > 0 "
    " OR instr(ifnull(meetings.agenda, ''), record_sources.quote) > 0)) AS quote_found "
    "FROM (SELECT note_id, 'decision' AS kind, day, '' AS answered FROM decisions "
    "      UNION ALL SELECT note_id, 'question', day, answered FROM questions) AS kinds "
    "LEFT JOIN record_sources ON record_sources.note_id = kinds.note_id "
    "LEFT JOIN notes AS source ON source.id = record_sources.source_id AND source.deleted_at IS NULL "
    "LEFT JOIN meetings ON meetings.note_id = record_sources.source_id"
)


def insert_record(conn: sqlite3.Connection, hub_id: int, kind: str, title: str, day: str, source_id: Optional[int],
                  quote: str, now: str, people: Iterable[int] = ()) -> int:
    """A record's note directly under its hub, its row, its source and its people, inside a
    caller's transaction; the values are clean already. Returns its note's id."""
    note_id = conn.execute(
        "INSERT INTO notes (parent_id, title, body, created_at, updated_at, title_shared) VALUES (?, ?, '', ?, ?, 1)",
        (hub_id, title, now, now),
    ).lastrowid
    conn.execute("INSERT INTO {} (note_id, day) VALUES (?, ?)".format(_TABLES[kind]), (note_id, day))
    conn.execute("INSERT INTO record_sources (note_id, source_id, quote) VALUES (?, ?, ?)", (note_id, source_id, quote))
    for person_id in people:
        conn.execute("INSERT OR IGNORE INTO record_people (note_id, person_id) VALUES (?, ?)", (note_id, person_id))
    return note_id


def _clean_quote(quote: object) -> str:
    if quote is None:
        return ""
    if not isinstance(quote, str) or len(quote) > MAX_QUOTE_LENGTH:
        raise BadTitle("The quoted text must be text of at most {} characters".format(MAX_QUOTE_LENGTH))
    return quote.strip()


def _record(row: sqlite3.Row, people: List[int]) -> Dict:
    record = {"id": row["note_id"], "kind": row["kind"], "day": row["day"], "people": people,
              "source_id": row["source_id"], "quote": row["quote"], "quote_found": bool(row["quote_found"])}
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
    row = conn.execute(_ROWS + " WHERE kinds.note_id = ?", (record_id,)).fetchone()
    if row is None:
        raise NotARecord('"{}" is not a decision or a question'.format(note["title"]))
    return row


def _question_row(conn: sqlite3.Connection, question_id: int) -> sqlite3.Row:
    row = _record_row(conn, question_id)
    if row["kind"] != "question":
        raise NotAQuestion('"{}" is a decision, not a question'.format(live_note_row(conn, question_id)["title"]))
    return row


def _check_owner(conn: sqlite3.Connection, owner_id: int) -> sqlite3.Row:
    """A record is made from a live hub, or a note or meeting in one. Returns the hub."""
    owner = live_note_row(conn, owner_id)
    top = top_note_row(conn, owner_id)
    if top["is_person"] or top["kind"] not in HUB_KINDS:
        raise NotAHub('"{}" is not in a hub: file it in a project or an area first'.format(owner["title"]))
    if top["archived_at"] is not None:
        raise HubArchived('"{}" is archived (:restore it first)'.format(top["title"]))
    return top
