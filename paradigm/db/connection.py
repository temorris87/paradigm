"""The SQLite database file: one connection, shared by the server's threads behind a lock."""
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Tuple

DB_FILE_NAME = "paradigm.db"
# VACUUM rewrites the whole file, so it runs only when that wins back a real share of it.
VACUUM_MIN_SHARE = 0.10
VACUUM_MIN_BYTES = 1_000_000


def worth_vacuuming(free_bytes: int, total_bytes: int) -> bool:
    """Free space is a tenth of the file, or a megabyte or more. Editing notes frees a page or
    two now and then; that alone never makes a start rewrite a big file."""
    if free_bytes <= 0:
        return False
    return free_bytes >= VACUUM_MIN_BYTES or free_bytes >= VACUUM_MIN_SHARE * total_bytes


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

    def space(self) -> Tuple[int, int]:
        """(free bytes, total bytes) of the database file: pages freed by deletes and the whole."""
        with self._lock:
            page_size = self._conn.execute("PRAGMA page_size").fetchone()[0]
            free = self._conn.execute("PRAGMA freelist_count").fetchone()[0]
            total = self._conn.execute("PRAGMA page_count").fetchone()[0]
        return free * page_size, total * page_size

    def vacuum_if_worth_it(self) -> bool:
        """Vacuums when enough of the file is free space (worth_vacuuming). True if it did."""
        if not worth_vacuuming(*self.space()):
            return False
        self.vacuum()
        return True

    def vacuum(self) -> None:
        """Gives freed space back to the disk. Never inside a transaction (SQLite refuses)."""
        with self._lock:
            self._conn.execute("VACUUM")
            # In WAL mode the rewrite lands in the -wal file; the checkpoint moves it into the
            # database and empties the -wal, so the files on disk really get smaller.
            self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    def close(self) -> None:
        with self._lock:
            self._conn.close()
