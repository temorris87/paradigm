import os
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database, worth_vacuuming


class WorthVacuumingTest(unittest.TestCase):
    def test_a_tenth_of_the_file_or_a_megabyte(self) -> None:
        self.assertFalse(worth_vacuuming(0, 100_000))
        self.assertFalse(worth_vacuuming(4096, 10_000_000), "a page freed by editing")
        self.assertTrue(worth_vacuuming(113_000, 400_000), "a deleted image in a small file")
        self.assertTrue(worth_vacuuming(1_000_000, 900_000_000), "a megabyte in a big file")
        self.assertFalse(worth_vacuuming(500_000, 900_000_000))


class VacuumTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.db = Database.in_folder(self.folder)
        with self.db.transaction() as conn:
            conn.execute("CREATE TABLE blobs (data BLOB)")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def files_size(self) -> int:
        return sum(path.stat().st_size for path in self.folder.iterdir()
                   if path.name in ("paradigm.db", "paradigm.db-wal"))

    def test_freed_space_goes_back_to_the_disk(self) -> None:
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO blobs VALUES (?)", (os.urandom(2_000_000),))
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM blobs")
        self.assertGreater(self.db.space()[0], 1_900_000)
        self.assertTrue(self.db.vacuum_if_worth_it())
        self.assertEqual(self.db.space()[0], 0)
        self.assertLess(self.files_size(), 100_000)
        self.assertFalse(self.db.vacuum_if_worth_it(), "nothing left to win back")


if __name__ == "__main__":
    unittest.main()
