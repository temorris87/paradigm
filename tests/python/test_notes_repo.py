import itertools
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import (BadTitle, Conflict, HasChildren, LastNote, NoteRepository,
                                    NotFound, TitleTaken, WouldCycle)
from paradigm.notes.seed import WELCOME_TITLE, seed_if_empty


class NoteRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        ticks = itertools.count(1)
        self.notes = NoteRepository(self.db, clock=lambda: "2026-01-01T00:00:{:02d}Z".format(next(ticks) % 60))

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def test_create_and_get(self) -> None:
        note = self.notes.create(None, "  Acme   kickoff ", "# Hello")
        self.assertEqual(note["title"], "Acme kickoff")
        self.assertIsNone(note["parent_id"])
        self.assertEqual(self.notes.get(note["id"])["body"], "# Hello")
        self.assertEqual(note["version"], 1)

    def test_nesting_and_the_tree(self) -> None:
        top = self.notes.create(None, "Projects")
        child = self.notes.create(top["id"], "Northwind")
        tree = {note["id"]: note for note in self.notes.tree()}
        self.assertEqual(tree[child["id"]]["parent_id"], top["id"])
        self.assertNotIn("body", tree[child["id"]])

    def test_siblings_cannot_share_a_title_but_cousins_can(self) -> None:
        a = self.notes.create(None, "A")
        b = self.notes.create(None, "B")
        self.notes.create(a["id"], "Notes")
        self.notes.create(b["id"], "Notes")
        with self.assertRaises(TitleTaken):
            self.notes.create(a["id"], "notes")
        with self.assertRaises(TitleTaken):
            self.notes.rename(b["id"], "a")

    def test_bad_titles(self) -> None:
        for title in ["", "   ", "a/b", "x#y", "p|q", "[[z]]", "bell\x07", None, 5]:
            with self.subTest(title=title), self.assertRaises(BadTitle):
                self.notes.create(None, title)

    def test_save_with_the_right_version(self) -> None:
        note = self.notes.create(None, "N", "one")
        saved = self.notes.save(note["id"], "two", note["version"])
        self.assertEqual(saved["body"], "two")
        self.assertEqual(saved["version"], 2)

    def test_save_from_a_stale_version_conflicts(self) -> None:
        note = self.notes.create(None, "N", "one")
        self.notes.save(note["id"], "from tab A", 1)
        with self.assertRaises(Conflict) as caught:
            self.notes.save(note["id"], "from tab B", 1)
        self.assertEqual(caught.exception.current_version, 2)
        self.assertEqual(self.notes.get(note["id"])["body"], "from tab A")
        forced = self.notes.save(note["id"], "from tab B", 1, force=True)
        self.assertEqual(forced["body"], "from tab B")

    def test_saving_the_same_text_keeps_the_version(self) -> None:
        note = self.notes.create(None, "N", "same")
        self.assertEqual(self.notes.save(note["id"], "same", 1)["version"], 1)

    def test_move(self) -> None:
        a = self.notes.create(None, "A")
        b = self.notes.create(None, "B")
        moved = self.notes.move(b["id"], a["id"])
        self.assertEqual(moved["parent_id"], a["id"])
        self.assertIsNone(self.notes.move(b["id"], None)["parent_id"])

    def test_move_under_itself_or_a_descendant_is_refused(self) -> None:
        a = self.notes.create(None, "A")
        b = self.notes.create(a["id"], "B")
        c = self.notes.create(b["id"], "C")
        for parent in (a["id"], c["id"]):
            with self.subTest(parent=parent), self.assertRaises(WouldCycle):
                self.notes.move(a["id"], parent)

    def test_move_into_a_taken_title_is_refused(self) -> None:
        a = self.notes.create(None, "A")
        self.notes.create(a["id"], "Same")
        loose = self.notes.create(None, "Same")
        with self.assertRaises(TitleTaken):
            self.notes.move(loose["id"], a["id"])

    def test_rename_and_move_keep_the_body_version(self) -> None:
        # Otherwise the tab that renamed a note would conflict with itself on its next save.
        a = self.notes.create(None, "A")
        note = self.notes.create(None, "N", "text")
        self.notes.rename(note["id"], "M")
        self.notes.move(note["id"], a["id"])
        self.assertEqual(self.notes.save(note["id"], "more", 1)["version"], 2)

    def test_the_last_note_cannot_be_deleted(self) -> None:
        top = self.notes.create(None, "Only")
        self.notes.create(top["id"], "Child")
        with self.assertRaises(LastNote):
            self.notes.delete(top["id"], recursive=True)

    def test_delete_a_leaf(self) -> None:
        self.notes.create(None, "Keeper")
        note = self.notes.create(None, "Gone")
        self.assertEqual(self.notes.delete(note["id"]), [note["id"]])
        with self.assertRaises(NotFound):
            self.notes.get(note["id"])
        self.assertEqual([n["title"] for n in self.notes.tree()], ["Keeper"])
        # The title is free again, and the row is still in the database.
        self.notes.create(None, "Gone")
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM notes").fetchone()[0], 3)

    def test_delete_with_children_needs_recursive(self) -> None:
        self.notes.create(None, "Keeper")
        top = self.notes.create(None, "Top")
        child = self.notes.create(top["id"], "Child")
        grandchild = self.notes.create(child["id"], "Grandchild")
        with self.assertRaises(HasChildren):
            self.notes.delete(top["id"])
        deleted = self.notes.delete(top["id"], recursive=True)
        self.assertEqual(sorted(deleted), sorted([top["id"], child["id"], grandchild["id"]]))
        self.assertEqual([n["title"] for n in self.notes.tree()], ["Keeper"])

    def test_missing_notes(self) -> None:
        with self.assertRaises(NotFound):
            self.notes.get(42)
        with self.assertRaises(NotFound):
            self.notes.create(42, "Orphan")
        a = self.notes.create(None, "A")
        with self.assertRaises(NotFound):
            self.notes.move(a["id"], 42)

    def test_seed_only_when_empty(self) -> None:
        seed_if_empty(self.notes)
        seed_if_empty(self.notes)
        titles = [note["title"] for note in self.notes.tree()]
        self.assertEqual(titles, [WELCOME_TITLE])
        self.assertIn("# Welcome", self.notes.get(self.notes.tree()[0]["id"])["body"])


if __name__ == "__main__":
    unittest.main()
