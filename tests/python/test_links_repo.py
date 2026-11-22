import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.links_repo import LinkRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.notes.links import BadLinks, clean_links


class LinkRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.links = LinkRepository(self.db)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def stale_ids(self):
        return [entry["id"] for entry in self.links.index()["stale"]]

    def targets(self):
        return {entry["id"]: entry["targets"] for entry in self.links.index()["links"]}

    def test_a_save_with_links_stores_them_at_the_new_version(self) -> None:
        note = self.notes.create(None, "Rollout", links=[])
        self.notes.save(note["id"], "see [[Style guide]] and [[Pilot/Plan]]", 1,
                        links=["Style guide", "Pilot/Plan"])
        self.assertEqual(self.targets(), {note["id"]: ["Style guide", "Pilot/Plan"]})
        self.assertNotIn(note["id"], self.stale_ids())

    def test_a_save_without_links_leaves_the_note_stale(self) -> None:
        note = self.notes.create(None, "Rollout", links=[])
        self.assertNotIn(note["id"], self.stale_ids())
        self.notes.save(note["id"], "[[Style guide]]", 1)
        stale = {entry["id"]: entry for entry in self.links.index()["stale"]}
        self.assertEqual((stale[note["id"]]["version"], stale[note["id"]]["body"]), (2, "[[Style guide]]"))

    def test_a_note_never_read_is_stale(self) -> None:
        note = self.notes.create(None, "Rollout", "[[A]]")
        self.assertIn(note["id"], self.stale_ids())

    def test_an_unchanged_save_with_links_catches_the_note_up(self) -> None:
        note = self.notes.create(None, "Rollout", "[[A]]")
        self.notes.save(note["id"], "[[A]]", 1, links=["A"])
        self.assertEqual((self.stale_ids(), self.targets()), ([], {note["id"]: ["A"]}))

    def test_catch_up_skips_a_note_saved_meanwhile(self) -> None:
        one = self.notes.create(None, "One", "[[A]]")
        two = self.notes.create(None, "Two", "[[B]]")
        self.notes.save(two["id"], "[[C]]", 1)
        stored = self.links.catch_up([(one["id"], 1, ["A"]), (two["id"], 1, ["B"])])
        self.assertEqual(stored, [one["id"]])
        self.assertEqual(self.targets(), {one["id"]: ["A"]})
        self.assertEqual(self.stale_ids(), [two["id"]])

    def test_trashed_notes_are_left_out_and_keep_their_links(self) -> None:
        self.notes.create(None, "Keep", links=[])
        note = self.notes.create(None, "Gone", "[[A]]", links=["A"])
        self.notes.delete(note["id"])
        self.assertEqual((self.targets(), self.stale_ids()), ({}, []))
        with self.db.reading() as conn:
            kept = conn.execute("SELECT target FROM note_links WHERE note_id = ?", (note["id"],)).fetchall()
        self.assertEqual([row[0] for row in kept], ["A"])

    def test_a_new_save_replaces_the_old_links(self) -> None:
        note = self.notes.create(None, "Rollout", "[[A]]", links=["A"])
        self.notes.save(note["id"], "[[B]]", 1, links=["B"])
        self.assertEqual(self.targets(), {note["id"]: ["B"]})


class CleanLinksTest(unittest.TestCase):
    def test_trims_and_drops_repeats_and_empties(self) -> None:
        self.assertEqual(clean_links([" A ", "B", "A", "  "]), ["A", "B"])

    def test_refuses_what_is_not_a_list_of_texts(self) -> None:
        for bad in ("A", None, [1], [["A"]], ["x" * 501], ["n{}".format(i) for i in range(1001)]):
            with self.assertRaises(BadLinks):
                clean_links(bad)


if __name__ == "__main__":
    unittest.main()
