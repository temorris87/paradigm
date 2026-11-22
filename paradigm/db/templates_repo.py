"""Note templates (019_templates.sql): a note_templates row makes a top-level note a
template, listed in the Templates group. Its title and text are its note's. The only code
that knows the note_templates table."""
from typing import Callable, Dict

from paradigm.db.connection import Database
from paradigm.db.notes_repo import check_title_free, utc_now
from paradigm.notes.titles import clean_title

Clock = Callable[[], str]

__all__ = ["TemplateRepository"]


class TemplateRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def create(self, title: object, body: object = "") -> int:
        """A new template: a top-level note (its title unique there) and its row."""
        title = clean_title(title)
        body = body if isinstance(body, str) else ""
        now = self._clock()
        with self._db.transaction() as conn:
            check_title_free(conn, None, title, None)
            note_id = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?)",
                (title, body, now, now)).lastrowid
            conn.execute("INSERT INTO note_templates (note_id) VALUES (?)", (note_id,))
        return note_id
