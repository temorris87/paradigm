import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.migrate import SchemaTooNew, migrate, migrations, schema_version


class MigrateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def test_fresh_database_reaches_the_newest_version(self) -> None:
        newest = migrations()[-1][0]
        self.assertEqual(migrate(self.db), newest)
        self.assertEqual(schema_version(self.db), newest)
        with self.db.reading() as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertIn("notes", tables)
        self.assertIn("images", tables)

    def test_running_again_changes_nothing(self) -> None:
        first = migrate(self.db)
        self.assertEqual(migrate(self.db), first)

    def test_a_newer_database_is_refused(self) -> None:
        with self.db.transaction() as conn:
            conn.execute("PRAGMA user_version = 999")
        with self.assertRaises(SchemaTooNew):
            migrate(self.db)

    def test_a_failing_migration_leaves_nothing_behind(self) -> None:
        folder = Path(self.tmp.name) / "migrations"
        folder.mkdir()
        (folder / "001_good.sql").write_text("CREATE TABLE a (x INTEGER);\n", encoding="utf-8")
        (folder / "002_bad.sql").write_text("CREATE TABLE b (x INTEGER);\nNOT SQL;\n", encoding="utf-8")
        with self.assertRaises(Exception):
            migrate(self.db, folder)
        self.assertEqual(schema_version(self.db), 1)
        with self.db.reading() as conn:
            names = {row[0] for row in conn.execute("SELECT name FROM sqlite_master")}
        self.assertEqual(names, {"a"})

    def test_numbering_gaps_are_an_error(self) -> None:
        folder = Path(self.tmp.name) / "gappy"
        folder.mkdir()
        (folder / "001_a.sql").write_text("SELECT 1;\n", encoding="utf-8")
        (folder / "003_c.sql").write_text("SELECT 1;\n", encoding="utf-8")
        with self.assertRaises(RuntimeError):
            migrations(folder)

    def test_hub_kind_comes_to_an_existing_database_as_the_inbox(self) -> None:
        # A database at schema 2 (before hubs), with a note in it.
        folder = Path(self.tmp.name) / "upto2"
        folder.mkdir()
        for number, path in migrations()[:2]:
            (folder / path.name).write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        migrate(self.db, folder)
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO notes (title, created_at, updated_at) VALUES ('Acme', 'x', 'x')")
        migrate(self.db)
        with self.db.reading() as conn:
            self.assertIsNone(conn.execute("SELECT kind FROM notes").fetchone()[0])
        with self.assertRaises(Exception):
            with self.db.transaction() as conn:
                conn.execute("UPDATE notes SET kind = 'archive'")

    def test_project_areas_come_to_an_existing_database_empty(self) -> None:
        folder = Path(self.tmp.name) / "upto3"
        folder.mkdir()
        for number, path in migrations()[:3]:
            (folder / path.name).write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        migrate(self.db, folder)
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO notes (title, kind, created_at, updated_at) VALUES ('Acme', 'project', 'x', 'x')")
        migrate(self.db)
        with self.db.reading() as conn:
            self.assertIsNone(conn.execute("SELECT area_id FROM notes").fetchone()[0])

    def test_archive_comes_to_an_existing_database_with_nothing_archived(self) -> None:
        folder = Path(self.tmp.name) / "upto4"
        folder.mkdir()
        for number, path in migrations()[:4]:
            (folder / path.name).write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        migrate(self.db, folder)
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO notes (title, kind, created_at, updated_at) VALUES ('Acme', 'project', 'x', 'x')")
        migrate(self.db)
        with self.db.reading() as conn:
            self.assertIsNone(conn.execute("SELECT archived_at FROM notes").fetchone()[0])

    def test_images_keep_their_rows_and_may_lose_their_note(self) -> None:
        folder = Path(self.tmp.name) / "upto9"
        folder.mkdir()
        for number, path in migrations()[:9]:
            (folder / path.name).write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        migrate(self.db, folder)
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO notes (id, title, created_at, updated_at) VALUES (1, 'Acme', 'x', 'x')")
            conn.execute("INSERT INTO images (id, note_id, mime, width, height, size, sha256, data, created_at) "
                         "VALUES (5, 1, 'image/png', 1, 1, 3, 'abc', x'010203', 'x')")
        migrate(self.db)
        with self.db.transaction() as conn:
            self.assertEqual(tuple(conn.execute("SELECT id, note_id, size FROM images").fetchone()), (5, 1, 3))
            conn.execute("UPDATE images SET note_id = NULL")
            conn.execute("DELETE FROM notes")

    def test_foreign_keys_are_on(self) -> None:
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
