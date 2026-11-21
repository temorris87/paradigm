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

    def test_foreign_keys_are_on(self) -> None:
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
