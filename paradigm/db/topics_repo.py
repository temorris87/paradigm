"""Every read and write of topics to raise with a person (027_person_topics.sql): the only code
that knows the person_topics table, besides insert_topic, which capture_repo uses inside a
note's save for "@Name ?" lines."""
import sqlite3
from typing import Callable, Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, utc_now
from paradigm.db.people_repo import NotAPerson, person_row

Clock = Callable[[], str]

__all__ = ["TopicRepository", "insert_topic", "clean_topic", "BadTopic", "NotFound", "NotAPerson"]

MAX_TOPIC = 500


class BadTopic(NoteError):
    """A topic that is empty or too long."""


def clean_topic(text: object) -> str:
    if not isinstance(text, str) or not " ".join(text.split()):
        raise BadTopic("A topic needs a few words")
    text = " ".join(text.split())
    if len(text) > MAX_TOPIC:
        raise BadTopic("A topic can be at most {} characters".format(MAX_TOPIC))
    return text


def insert_topic(conn: sqlite3.Connection, person_id: int, text: str, source_note_id: Optional[int],
                 source_line: Optional[int], now: str) -> Optional[int]:
    """A topic, unless the same text from the same note is there already (raised or not).
    Returns its id, or None when it was there."""
    if source_note_id is not None and conn.execute(
            "SELECT 1 FROM person_topics WHERE person_id = ? AND source_note_id = ? AND text = ?",
            (person_id, source_note_id, text)).fetchone():
        return None
    return conn.execute(
        "INSERT INTO person_topics (person_id, text, source_note_id, source_line, created_at) VALUES (?, ?, ?, ?, ?)",
        (person_id, text, source_note_id, source_line, now)).lastrowid


class TopicRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every topic of a live person, oldest first."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT person_topics.* FROM person_topics JOIN notes ON notes.id = person_topics.person_id "
                "WHERE notes.deleted_at IS NULL ORDER BY person_topics.id").fetchall()
        return [_topic(row) for row in rows]

    def create(self, person_id: int, text: object) -> Dict:
        text = clean_topic(text)
        with self._db.transaction() as conn:
            person_row(conn, person_id)
            topic_id = insert_topic(conn, person_id, text, None, None, self._clock())
            return _topic(_row(conn, topic_id))

    def raise_(self, topic_id: int, raised: bool) -> Dict:
        """Ticked off in a 1:1 (or back to raise)."""
        with self._db.transaction() as conn:
            _row(conn, topic_id)
            conn.execute("UPDATE person_topics SET raised_at = ? WHERE id = ?", (self._clock() if raised else "", topic_id))
            return _topic(_row(conn, topic_id))

    def remove(self, topic_id: int) -> None:
        with self._db.transaction() as conn:
            _row(conn, topic_id)
            conn.execute("DELETE FROM person_topics WHERE id = ?", (topic_id,))


def _topic(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "person_id": row["person_id"], "text": row["text"], "source_note_id": row["source_note_id"],
            "source_line": row["source_line"], "created_at": row["created_at"], "raised_at": row["raised_at"]}


def _row(conn: sqlite3.Connection, topic_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM person_topics WHERE id = ?", (topic_id,)).fetchone()
    if row is None:
        raise NotFound("No such topic: {}".format(topic_id))
    return row
