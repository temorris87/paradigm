"""Brings a database up to the newest schema: migrations/NNN_name.sql, applied in order.

The schema version is kept in PRAGMA user_version: migration NNN leaves it at NNN.
"""
import re
import sqlite3
from pathlib import Path
from typing import List, Tuple

from paradigm.db.connection import Database

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_NAME = re.compile(r"(\d{3})_[a-z0-9_]+\.sql")


class SchemaTooNew(Exception):
    """The database was written by a newer Paradigm than this one."""


def migrations(folder: Path = MIGRATIONS_DIR) -> List[Tuple[int, Path]]:
    found = []
    for path in folder.iterdir():
        match = _NAME.fullmatch(path.name)
        if match:
            found.append((int(match.group(1)), path))
    found.sort()
    numbers = [number for number, _ in found]
    if numbers != list(range(1, len(numbers) + 1)):
        raise RuntimeError("migrations must be numbered 001, 002, ... with no gaps: {}".format(numbers))
    return found


def schema_version(db: Database) -> int:
    with db.reading() as conn:
        return conn.execute("PRAGMA user_version").fetchone()[0]


def migrate(db: Database, folder: Path = MIGRATIONS_DIR) -> int:
    """Apply what is missing; returns the version the database is now at."""
    steps = migrations(folder)
    newest = steps[-1][0] if steps else 0
    current = schema_version(db)
    if current > newest:
        raise SchemaTooNew(
            "The notes database {} was made by a newer Paradigm (schema {}, this one knows {}). "
            "Update Paradigm (git pull) and start it again.".format(db.path, current, newest)
        )
    for number, path in steps[current:]:
        script = path.read_text(encoding="utf-8")
        with db.transaction() as conn:
            for statement in _statements(script):
                conn.execute(statement)
            # PRAGMA takes no parameters; number is an int from the file name, never input.
            conn.execute("PRAGMA user_version = {:d}".format(number))
    return max(current, newest)


def _statements(script: str) -> List[str]:
    """executescript() would commit on its own, outside our transaction, so split instead."""
    statements, pending = [], ""
    for line in script.splitlines(keepends=True):
        if line.lstrip().startswith("--"):
            continue
        pending += line
        if pending.strip() and sqlite3.complete_statement(pending):
            statements.append(pending.strip())
            pending = ""
    if pending.strip():
        raise ValueError("unfinished SQL statement: {!r}".format(pending.strip()))
    return statements

