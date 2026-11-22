"""Migration 011 (pages): meetings lose the date in their title, records and notes leave
meetings, people get names, and every note's index is read again."""
import shutil
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.migrate import migrate, migrations


class PagesMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        folder = Path(self.tmp.name)
        old = folder / "old"
        old.mkdir()
        for number, path in migrations():
            if number <= 10:
                shutil.copy(path, old / path.name)
        self.db = Database.in_folder(folder)
        migrate(self.db, old)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def note(self, conn, parent, title, kind=None) -> int:
        return conn.execute("INSERT INTO notes (parent_id, title, kind, created_at, updated_at) "
                            "VALUES (?, ?, ?, 'x', 'x')", (parent, title, kind)).lastrowid

    def test_meetings_records_and_people(self) -> None:
        with self.db.transaction() as conn:
            hub = self.note(conn, None, "Rollout", "project")
            plans = self.note(conn, hub, "Plans")
            nested = self.note(conn, plans, "2026-11-23 Weekly sync")
            conn.execute("INSERT INTO meetings (note_id, day) VALUES (?, '2026-11-23')", (nested,))
            top = self.note(conn, hub, "2026-11-30 Weekly sync")
            conn.execute("INSERT INTO meetings (note_id, day) VALUES (?, '2026-11-30')", (top,))
            under = self.note(conn, nested, "Plans")
            decision = self.note(conn, nested, "Ship it")
            conn.execute("INSERT INTO decisions (note_id, day) VALUES (?, '2026-11-23')", (decision,))
            question = self.note(conn, hub, "Why?")
            conn.execute("INSERT INTO questions (note_id, day) VALUES (?, '2026-11-23')", (question,))
            person = self.note(conn, None, "Priya Shah Lee")
            conn.execute("INSERT INTO people (note_id) VALUES (?)", (person,))
            conn.execute("INSERT INTO link_index (note_id, version) VALUES (?, 1)", (plans,))
        migrate(self.db)
        with self.db.reading() as conn:
            rows = {row["id"]: row for row in conn.execute("SELECT * FROM notes")}
            self.assertEqual([rows[each]["title"] for each in (nested, top)], ["Weekly sync", "Weekly sync"])
            self.assertEqual({rows[each]["parent_id"] for each in (nested, top, decision, question)}, {hub})
            self.assertEqual((rows[under]["parent_id"], rows[under]["title"]), (hub, "Plans (moved {})".format(under)))
            sources = dict(conn.execute("SELECT note_id, source_id FROM record_sources").fetchall())
            self.assertEqual(sources, {decision: nested, question: None})
            self.assertEqual(tuple(conn.execute("SELECT first, last FROM people").fetchone()), ("Priya", "Shah Lee"))
            self.assertEqual(conn.execute("SELECT count(*) FROM link_index").fetchone()[0], 0)
            self.assertEqual(rows[hub]["status"], "active")


if __name__ == "__main__":
    unittest.main()
