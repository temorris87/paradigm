"""Resources as notes in folders (021_resource_folders.sql, folders_repo.py): folders nest and
hold resource notes; a resource is no longer a hub; folders go to the Trash with their notes."""
import shutil
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.folders_repo import FolderRepository, TitleTaken, WouldCycle
from paradigm.db.meetings_repo import MeetingRepository, NotAHub
from paradigm.db.migrate import migrate, migrations
from paradigm.db.notes_repo import HoldsHubThings, NoteRepository, NotAResource, NotFound
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.people_repo import NotAHub as PersonNotAHub
from paradigm.db.trash_repo import TrashRepository


class Clock:
    def __init__(self) -> None:
        self.now = "2026-11-21T12:00:00.000Z"

    def __call__(self) -> str:
        return self.now


class FolderRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.clock = Clock()
        self.notes = NoteRepository(self.db, clock=self.clock)
        self.folders = FolderRepository(self.db, clock=self.clock)
        self.trash = TrashRepository(self.db, clock=self.clock, keep_days=7)
        self.keep = self.notes.create(None, "Keep")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def resource(self, title, folder=None):
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], "resource")
        return self.notes.set_folder(note["id"], folder)

    def test_folders_nest_and_hold_resources(self) -> None:
        standards = self.folders.create(None, "Standards")
        electrical = self.folders.create(standards["id"], "Electrical")
        note = self.resource("Cable sizing", electrical["id"])
        self.assertEqual(note["folder_id"], electrical["id"])
        self.assertEqual([f["title"] for f in self.folders.list()], ["Electrical", "Standards"])
        self.assertEqual(self.notes.set_folder(note["id"], None)["folder_id"], None)

    def test_names_are_unique_per_parent(self) -> None:
        a = self.folders.create(None, "A")
        self.folders.create(a["id"], "Same")
        self.folders.create(None, "Same")
        with self.assertRaises(TitleTaken):
            self.folders.create(None, "same")
        b = self.folders.create(None, "B")
        with self.assertRaises(TitleTaken):
            self.folders.rename(b["id"], "SAME")
        self.folders.create(a["id"], "B")
        with self.assertRaises(TitleTaken):
            self.folders.move(b["id"], a["id"])

    def test_never_moves_into_itself(self) -> None:
        a = self.folders.create(None, "A")
        b = self.folders.create(a["id"], "B")
        with self.assertRaises(WouldCycle):
            self.folders.move(a["id"], b["id"])
        with self.assertRaises(WouldCycle):
            self.folders.move(a["id"], a["id"])
        self.assertEqual(self.folders.move(b["id"], None)["parent_id"], None)

    def test_only_a_resource_goes_in_a_folder_and_leaves_it_when_refiled(self) -> None:
        folder = self.folders.create(None, "F")
        plain = self.notes.create(None, "Plain")
        with self.assertRaises(NotAResource):
            self.notes.set_folder(plain["id"], folder["id"])
        note = self.resource("Doc", folder["id"])
        self.assertIsNone(self.notes.set_kind(note["id"], "area")["folder_id"])
        note = self.resource("Doc2", folder["id"])
        self.assertIsNone(self.notes.move(note["id"], self.keep["id"])["folder_id"], "under a note: out of the folder")
        with self.assertRaises(NotFound):
            self.notes.set_folder(self.resource("Doc3")["id"], 999)

    def test_trash_takes_the_folders_inside_and_their_notes_restore_brings_folders_back(self) -> None:
        top = self.folders.create(None, "Top")
        inner = self.folders.create(top["id"], "Inner")
        doc = self.resource("Doc", inner["id"])
        under = self.notes.create(doc["id"], "Under")
        result = self.folders.trash(top["id"])
        self.assertEqual(sorted(result["folders"]), sorted([top["id"], inner["id"]]))
        self.assertEqual(sorted(result["notes"]), sorted([doc["id"], under["id"]]))
        self.assertEqual(self.folders.list(), [])
        self.assertEqual([e["id"] for e in self.trash.entries()], [doc["id"]], "one entry: the note, with the one under it")
        self.trash.restore(doc["id"])
        self.assertEqual([f["title"] for f in self.folders.list()], ["Inner", "Top"])
        self.assertEqual(self.notes.get(doc["id"])["folder_id"], inner["id"])
        self.assertEqual(self.notes.get(under["id"])["parent_id"], doc["id"])

    def test_purge_deletes_trashed_folders_after_their_notes(self) -> None:
        top = self.folders.create(None, "Top")
        self.resource("Doc", top["id"])
        self.folders.trash(top["id"])
        self.clock.now = "2026-11-29T12:00:00.000Z"
        self.assertEqual(self.trash.purge(), 1)
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM resource_folders").fetchone()[0], 0)

    def test_a_resource_is_not_a_hub(self) -> None:
        note = self.resource("Manuals")
        with self.assertRaises(NotAHub):
            MeetingRepository(self.db, clock=self.clock).create(note["id"], "Sync", "2026-11-23")
        people = PeopleRepository(self.db)
        person_id, _ = people.create("Jane Doe")
        with self.assertRaises(PersonNotAHub):
            people.link(note["id"], person_id, "")

    def test_a_note_holding_hub_things_cannot_become_a_resource(self) -> None:
        hub = self.notes.create(None, "Rollout")
        self.notes.set_kind(hub["id"], "project")
        MeetingRepository(self.db, clock=self.clock).create(hub["id"], "Sync", "2026-11-23")
        with self.assertRaises(HoldsHubThings):
            self.notes.set_kind(hub["id"], "resource")
        self.assertEqual(self.notes.get(hub["id"])["kind"], "project")


class ResourceFoldersMigrationTest(unittest.TestCase):
    """021: resources holding what only a hub may become areas; the rest stay resources."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        folder = Path(self.tmp.name)
        old = folder / "old"
        old.mkdir()
        for number, path in migrations():
            if number <= 20:
                shutil.copy(path, old / path.name)
        self.db = Database.in_folder(folder)
        migrate(self.db, old)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def test_resources_with_hub_things_become_areas(self) -> None:
        def note(conn, parent, title, kind=None):
            return conn.execute("INSERT INTO notes (parent_id, title, kind, created_at, updated_at) "
                                "VALUES (?, ?, ?, 'x', 'x')", (parent, title, kind)).lastrowid
        with self.db.transaction() as conn:
            plain = note(conn, None, "Manuals", "resource")
            note(conn, plain, "Chapter")
            met = note(conn, None, "Vendors", "resource")
            sync = note(conn, met, "Sync")
            conn.execute("INSERT INTO meetings (note_id, day) VALUES (?, '2026-11-23')", (sync,))
            asked = note(conn, None, "Library", "resource")
            question = note(conn, asked, "Where?")
            conn.execute("INSERT INTO questions (note_id, day) VALUES (?, '2026-11-23')", (question,))
            peopled = note(conn, None, "Contacts", "resource")
            person = note(conn, None, "Jane Doe")
            conn.execute("INSERT INTO people (note_id) VALUES (?)", (person,))
            conn.execute("INSERT INTO hub_people (hub_id, person_id) VALUES (?, ?)", (peopled, person))
        migrate(self.db)
        with self.db.reading() as conn:
            kinds = dict(conn.execute("SELECT title, kind FROM notes WHERE parent_id IS NULL").fetchall())
            folders = conn.execute("SELECT folder_id FROM notes WHERE title = 'Manuals'").fetchone()[0]
        self.assertEqual(kinds["Manuals"], "resource")
        self.assertEqual([kinds[t] for t in ("Vendors", "Library", "Contacts")], ["area"] * 3)
        self.assertIsNone(folders, "at the top of Resources")


if __name__ == "__main__":
    unittest.main()
