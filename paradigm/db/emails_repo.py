"""Outlook emails attached to tasks (030_task_emails.sql). The only code that knows the
task_emails table, and the folder their bytes are saved in.

Outlook opens a real file, so each .msg is saved as <emails>/<task_id>/<email_id>.msg. The row
and the file are written in the same transaction: a failed write rolls the row back. When a
task is deleted (removed, or purged with its note), drop_emails and remove_saved take its rows
and its folder; a file that won't go is logged and left, never an error to the user."""
import logging
import shutil
import sqlite3
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, utc_now
from paradigm.files import folders as disk
from paradigm.files.msg_reader import read_msg
from paradigm.notes.days import local_today

__all__ = ["EmailRepository", "NotFound", "NotAnEmail", "AlreadyAttached", "EmailMissing", "BadReply",
           "drop_emails", "remove_saved", "REPLY_STATES"]

log = logging.getLogger("paradigm")

Clock = Callable[[], str]
Opener = Callable[[Path], None]

REPLY_STATES = ("needed", "replied", "none")
MAX_FILE_NAME = 255
_FALLBACK_NAME = "email.msg"
_LIVE_TASK = ("SELECT tasks.id FROM tasks JOIN notes ON notes.id = tasks.note_id "
              "WHERE tasks.id = ? AND tasks.removed_at IS NULL AND notes.deleted_at IS NULL")
# An email is reachable while its task is live.
_LIVE_EMAIL = ("SELECT task_emails.* FROM task_emails JOIN tasks ON tasks.id = task_emails.task_id "
               "JOIN notes ON notes.id = tasks.note_id "
               "WHERE task_emails.id = ? AND tasks.removed_at IS NULL AND notes.deleted_at IS NULL")


class NotAnEmail(NoteError):
    def __init__(self) -> None:
        super().__init__("not an Outlook message (.msg)")


class AlreadyAttached(NoteError):
    def __init__(self) -> None:
        super().__init__("already on this task")


class EmailMissing(NoteError):
    def __init__(self) -> None:
        super().__init__("the saved email is missing")


class BadReply(NoteError):
    pass


class EmailRepository:
    def __init__(self, db: Database, folder: Path, clock: Clock = utc_now, today: Callable[[], str] = local_today,
                 opener: Optional[Opener] = None):
        self._db = db
        self.folder = folder
        self._clock = clock
        self._today = today
        self._opener = opener

    def add(self, task_id: int, name: object, data: bytes) -> Dict:
        """Attaches a .msg to a live task, starting as "Reply needed"."""
        with self._db.transaction() as conn:
            _task_row(conn, task_id)
            try:
                info = read_msg(data)
            except ValueError:
                raise NotAnEmail()
            if conn.execute("SELECT 1 FROM task_emails WHERE task_id = ? AND subject = ? AND sender = ? "
                            "AND sent_at IS ?", (task_id, info.subject, info.sender, info.sent_at)).fetchone():
                raise AlreadyAttached()
            email_id = conn.execute(
                "INSERT INTO task_emails (task_id, subject, sender, sender_email, sent_at, file_name, added_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task_id, info.subject, info.sender, info.sender_email, info.sent_at, clean_file_name(name),
                 self._clock())).lastrowid
            # Inside the transaction: if the file can't be written, the row is rolled back.
            self._write(task_id, email_id, data)
            return _email(_email_row(conn, email_id))

    def list(self, task_id: int) -> List[Dict]:
        """A live task's emails, newest sent first (those with no time last)."""
        with self._db.reading() as conn:
            _task_row(conn, task_id)
            rows = conn.execute("SELECT * FROM task_emails WHERE task_id = ? "
                                "ORDER BY sent_at IS NULL, sent_at DESC, id DESC", (task_id,)).fetchall()
        return [_email(row) for row in rows]

    def set_reply(self, email_id: int, reply: object) -> Dict:
        """"replied" is dated today; the other states clear the day."""
        if reply not in REPLY_STATES:
            raise BadReply("reply must be one of: {}".format(", ".join(REPLY_STATES)))
        with self._db.transaction() as conn:
            _email_row(conn, email_id)
            conn.execute("UPDATE task_emails SET reply = ?, replied_on = ? WHERE id = ?",
                         (reply, self._today() if reply == "replied" else None, email_id))
            return _email(_email_row(conn, email_id))

    def open(self, email_id: int) -> None:
        """Opens the saved .msg in this computer's program for it (Outlook)."""
        with self._db.reading() as conn:
            row = _email_row(conn, email_id)
        path = self.path_of(row["task_id"], email_id)
        if not path.is_file():
            raise EmailMissing()
        # Looked up when used, so a test can stand in for the program that opens it.
        (self._opener or disk.open_file)(path)

    def remove(self, email_id: int) -> None:
        """Takes the email off its task, and deletes the saved copy."""
        with self._db.transaction() as conn:
            row = _email_row(conn, email_id)
            conn.execute("DELETE FROM task_emails WHERE id = ?", (email_id,))
        path = self.path_of(row["task_id"], email_id)
        try:
            path.unlink(missing_ok=True)
            if not any(path.parent.iterdir()):
                path.parent.rmdir()
        except OSError:
            log.warning("could not delete the saved email %s", path, exc_info=True)

    def path_of(self, task_id: int, email_id: int) -> Path:
        return self.folder / str(int(task_id)) / "{:d}.msg".format(email_id)

    def _write(self, task_id: int, email_id: int, data: bytes) -> None:
        path = self.path_of(task_id, email_id)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        except BaseException:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            raise


def clean_file_name(name: object) -> str:
    """The dropped file's own name, without any folder in it."""
    if not isinstance(name, str):
        return _FALLBACK_NAME
    base = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    base = "".join(ch for ch in base if ch >= " ")
    return base[:MAX_FILE_NAME] or _FALLBACK_NAME


def drop_emails(conn: sqlite3.Connection, task_ids: Iterable[int]) -> List[int]:
    """Deletes the email rows of these tasks, inside a caller's transaction. Returns the ids of
    the tasks that had any, whose folders remove_saved takes once the transaction is done."""
    had: List[int] = []
    for task_id in task_ids:
        if conn.execute("SELECT 1 FROM task_emails WHERE task_id = ? LIMIT 1", (task_id,)).fetchone():
            had.append(task_id)
            conn.execute("DELETE FROM task_emails WHERE task_id = ?", (task_id,))
    return had


def remove_saved(folder: Optional[Path], task_ids: Iterable[int]) -> None:
    """Deletes the tasks' saved-email folders. A failure is logged and the files left."""
    if folder is None:
        return
    for task_id in task_ids:
        path = folder / str(int(task_id))
        if not path.exists():
            continue
        try:
            shutil.rmtree(path)
        except OSError:
            log.warning("could not delete the saved emails in %s", path, exc_info=True)


def _email(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "task_id": row["task_id"], "subject": row["subject"], "sender": row["sender"],
            "sender_email": row["sender_email"], "sent_at": row["sent_at"], "reply": row["reply"],
            "replied_on": row["replied_on"], "file_name": row["file_name"], "added_at": row["added_at"]}


def _task_row(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
    row = conn.execute(_LIVE_TASK, (task_id,)).fetchone()
    if row is None:
        raise NotFound("No such task: {}".format(task_id))
    return row


def _email_row(conn: sqlite3.Connection, email_id: int) -> sqlite3.Row:
    row = conn.execute(_LIVE_EMAIL, (email_id,)).fetchone()
    if row is None:
        raise NotFound("No such email: {}".format(email_id))
    return row
