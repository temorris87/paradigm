import itertools
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import (AreaArchived, BadKind, BadTitle, Conflict, HasChildren, LastNote,
                                    NoteRepository, NotAnArea, NotAProject, NotArchived, NotFound,
                                    NotTopLevel, TitleTaken, WouldCycle)
from paradigm.db.links_repo import LinkRepository
from paradigm.notes.hubs import BadProjectField
from paradigm.notes.mentions import Mention
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

    def test_a_projects_status_and_due_date(self) -> None:
        project = self.notes.create(None, "Rollout")["id"]
        with self.assertRaises(NotAProject):
            self.notes.set_status(project, "on_hold")
        self.notes.set_kind(project, "project")
        self.assertEqual(self.notes.get(project)["status"], "active")
        self.assertEqual(self.notes.set_status(project, "on_hold")["status"], "on_hold")
        self.assertEqual(self.notes.set_due(project, "2026-12-15")["due"], "2026-12-15")
        self.assertEqual(self.notes.set_due(project, "")["due"], "")
        with self.assertRaises(BadProjectField):
            self.notes.set_status(project, "paused")
        with self.assertRaises(BadProjectField):
            self.notes.set_due(project, "soon")

    def test_mentions_are_stored_with_a_save(self) -> None:
        note = self.notes.create(None, "Plan")
        self.notes.save(note["id"], "- @Priya to check", 1, links=[], mentions=[Mention("body", 0, "Priya", "- @Priya to check")])
        index = LinkRepository(self.db).index()
        self.assertEqual(index["mentions"], [{"id": note["id"], "field": "body", "line": 0, "name": "Priya",
                                              "context": "- @Priya to check"}])

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

    def test_new_notes_are_in_the_inbox(self) -> None:
        note = self.notes.create(None, "Acme")
        self.assertIsNone(note["kind"])
        self.assertIsNone(self.notes.tree()[0]["kind"])

    def test_set_kind_files_a_top_level_note(self) -> None:
        note = self.notes.create(None, "Acme")
        for kind in ("project", "area", "resource", None):
            filed = self.notes.set_kind(note["id"], kind)
            self.assertEqual((filed["kind"], filed["parent_id"]), (kind, None))
        self.assertEqual(self.notes.get(note["id"])["version"], 1)

    def test_set_kind_on_a_nested_note_moves_it_to_the_top(self) -> None:
        top = self.notes.create(None, "Acme")
        child = self.notes.create(top["id"], "Kickoff")
        filed = self.notes.set_kind(child["id"], "project")
        self.assertEqual((filed["kind"], filed["parent_id"]), ("project", None))

    def test_set_kind_refuses_a_title_taken_at_the_top(self) -> None:
        self.notes.create(None, "Kickoff")
        top = self.notes.create(None, "Acme")
        child = self.notes.create(top["id"], "kickoff")
        with self.assertRaises(TitleTaken):
            self.notes.set_kind(child["id"], "area")
        after = self.notes.get(child["id"])
        self.assertEqual((after["kind"], after["parent_id"]), (None, top["id"]))

    def test_bad_kinds_are_refused(self) -> None:
        note = self.notes.create(None, "Acme")
        for kind in ("archive", "", "Project", 1, ["project"]):
            with self.assertRaises(BadKind):
                self.notes.set_kind(note["id"], kind)

    def test_moving_a_hub_under_a_note_unfiles_it(self) -> None:
        hub = self.notes.create(None, "Acme")
        other = self.notes.create(None, "Northwind")
        self.notes.set_kind(hub["id"], "project")
        self.notes.set_kind(other["id"], "area")
        moved = self.notes.move(hub["id"], other["id"])
        self.assertIsNone(moved["kind"])
        back = self.notes.move(hub["id"], None)
        self.assertIsNone(back["kind"])
        # Moving a top-level hub to the top level again keeps its kind.
        self.assertEqual(self.notes.move(other["id"], None)["kind"], "area")

    def hub(self, title: str, kind: str) -> dict:
        return self.notes.set_kind(self.notes.create(None, title)["id"], kind)

    def test_a_project_goes_in_an_area(self) -> None:
        area = self.hub("Operations", "area")
        project = self.hub("Acme", "project")
        self.assertIsNone(project["area_id"])
        self.assertEqual(self.notes.set_area(project["id"], area["id"])["area_id"], area["id"])
        tree = {note["id"]: note for note in self.notes.tree()}
        self.assertEqual(tree[project["id"]]["area_id"], area["id"])
        self.assertIsNone(self.notes.set_area(project["id"], None)["area_id"])

    def test_only_projects_go_only_in_areas(self) -> None:
        area = self.hub("Operations", "area")
        project = self.hub("Acme", "project")
        resource = self.hub("Manuals", "resource")
        inbox = self.notes.create(None, "Loose")
        for note in (area, resource, inbox):
            with self.subTest(note=note["title"]), self.assertRaises(NotAProject):
                self.notes.set_area(note["id"], area["id"])
        for target in (project, resource, inbox):
            with self.subTest(target=target["title"]), self.assertRaises(NotAnArea):
                self.notes.set_area(project["id"], target["id"])
        with self.assertRaises(NotFound):
            self.notes.set_area(project["id"], 999)

    def test_area_links_go_when_a_hub_changes(self) -> None:
        area = self.hub("Operations", "area")
        a = self.hub("Acme", "project")
        b = self.hub("Northwind", "project")
        for project in (a, b):
            self.notes.set_area(project["id"], area["id"])
        # A project filed as something else leaves its area.
        self.assertIsNone(self.notes.set_kind(a["id"], "resource")["area_id"])
        self.notes.set_kind(a["id"], "project")
        self.notes.set_area(a["id"], area["id"])
        # A project moved under a note leaves it too.
        self.assertIsNone(self.notes.move(a["id"], b["id"])["area_id"])
        # An area filed as something else empties.
        self.notes.set_kind(area["id"], "resource")
        self.assertIsNone(self.notes.get(b["id"])["area_id"])

    def test_refiling_an_area_as_an_area_keeps_its_projects(self) -> None:
        area = self.hub("Operations", "area")
        project = self.hub("Acme", "project")
        self.notes.set_area(project["id"], area["id"])
        self.notes.set_kind(area["id"], "area")
        self.assertEqual(self.notes.get(project["id"])["area_id"], area["id"])

    def test_a_trashed_area_keeps_its_links(self) -> None:
        area = self.hub("Operations", "area")
        project = self.hub("Acme", "project")
        self.notes.set_area(project["id"], area["id"])
        self.notes.delete(area["id"])
        self.assertEqual(self.notes.get(project["id"])["area_id"], area["id"])

    def test_archive_and_restore_a_hub_with_its_notes(self) -> None:
        area = self.hub("Operations", "area")
        project = self.hub("Acme", "project")
        self.notes.set_area(project["id"], area["id"])
        kickoff = self.notes.create(project["id"], "Kickoff")
        self.notes.create(kickoff["id"], "Minutes")
        archived, inside = self.notes.set_archived(project["id"], True)
        self.assertIsNotNone(archived["archived_at"])
        self.assertEqual(inside, 2)
        # Kind and area stay, so it goes back where it was; the notes inside keep no mark.
        self.assertEqual((archived["kind"], archived["area_id"]), ("project", area["id"]))
        self.assertIsNone(self.notes.get(kickoff["id"])["archived_at"])
        # Archiving again changes nothing.
        self.assertEqual(self.notes.set_archived(project["id"], True)[0]["archived_at"], archived["archived_at"])
        restored, _ = self.notes.set_archived(project["id"], False)
        self.assertIsNone(restored["archived_at"])
        self.assertEqual((restored["kind"], restored["area_id"]), ("project", area["id"]))
        with self.assertRaises(NotArchived):
            self.notes.set_archived(project["id"], False)

    def test_only_a_top_level_note_is_archived(self) -> None:
        project = self.hub("Acme", "project")
        kickoff = self.notes.create(project["id"], "Kickoff")
        with self.assertRaises(NotTopLevel):
            self.notes.set_archived(kickoff["id"], True)
        # An Inbox note is a whole hub too.
        loose = self.notes.create(None, "Loose")
        self.assertIsNotNone(self.notes.set_archived(loose["id"], True)[0]["archived_at"])

    def test_an_archived_title_stays_taken(self) -> None:
        project = self.hub("Acme", "project")
        self.notes.set_archived(project["id"], True)
        with self.assertRaises(TitleTaken):
            self.notes.create(None, "acme")

    def test_moving_an_archived_hub_under_a_note_drops_the_mark(self) -> None:
        project = self.hub("Acme", "project")
        other = self.notes.create(None, "Other")
        self.notes.set_archived(project["id"], True)
        self.assertIsNone(self.notes.move(project["id"], other["id"])["archived_at"])

    def test_no_project_goes_in_an_archived_area(self) -> None:
        area = self.hub("Operations", "area")
        project = self.hub("Acme", "project")
        self.notes.set_area(project["id"], area["id"])
        self.notes.set_archived(area["id"], True)
        # Its projects keep the link...
        self.assertEqual(self.notes.get(project["id"])["area_id"], area["id"])
        # ...but none is put in it while it is archived.
        other = self.hub("Northwind", "project")
        with self.assertRaises(AreaArchived):
            self.notes.set_area(other["id"], area["id"])

    def test_seed_only_when_empty(self) -> None:
        seed_if_empty(self.notes)
        seed_if_empty(self.notes)
        titles = [note["title"] for note in self.notes.tree()]
        self.assertEqual(titles, [WELCOME_TITLE])
        self.assertIn("# Welcome", self.notes.get(self.notes.tree()[0]["id"])["body"])


if __name__ == "__main__":
    unittest.main()
