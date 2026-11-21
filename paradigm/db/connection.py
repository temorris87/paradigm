"""The SQLite database file: one connection, shared by the server's threads behind a lock."""
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DB_FILE_NAME = "paradigm.db"


class Database:
    """One user means few, short requests, so a lock around one connection is simpler (and
    safer) than a connection per thread."""

    def __init__(self, path: Path):
        self.path = path
        # isolation_level=None: transactions are begun and ended here, explicitly.
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA busy_timeout = 5000")
        self._lock = threading.RLock()

    @classmethod
    def in_folder(cls, data_dir: Path) -> "Database":
        data_dir.mkdir(parents=True, exist_ok=True)
        return cls(data_dir / DB_FILE_NAME)

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Everything inside commits together, or not at all if it raises."""
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            self._conn.execute("COMMIT")

    @contextmanager
    def reading(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            yield self._conn

    def close(self) -> None:
        with self._lock:
            self._conn.close()
