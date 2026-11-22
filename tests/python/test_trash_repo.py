import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.images_repo import ImageRepository
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository, NotFound, StaysInAHub
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.trash_repo import TrashRepository
from image_samples import png


class Clock:
    def __init__(self) -> None:
        self.now = "2026-11-21T12:00:00.000Z"

    def __call__(self) -> str:
        return self.now


class TrashRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.clock = Clock()
        self.notes = NoteRepository(self.db, clock=self.clock)
        self.trash = TrashRepository(self.db, clock=self.clock, keep_days=7)
        self.keep = self.notes.create(None, "Keep")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def at(self, when: str) -> None:
        self.clock.now = when

    def titles(self):
        return sorted(note["title"] for note in self.notes.tree())

    def test_an_entry_is_a_note_with_the_notes_trashed_with_it(self) -> None:
        acme = self.notes.create(None, "Acme")
        budget = self.notes.create(acme["id"], "Budget")
        self.notes.create(budget["id"], "Q1")
        q2 = self.notes.create(budget["id"], "Q2")
        self.at("2026-11-21T13:00:00.000Z")
        self.notes.delete(q2["id"])
        self.at("2026-11-21T14:00:00.000Z")
        self.notes.delete(budget["id"], recursive=True)
        entries = self.trash.entries()
        self.assertEqual([(e["title"], e["inside"], e["parent_state"]) for e in entries],
                         [("Budget", 1, "live"), ("Q2", 0, "trashed")])
        self.assertEqual(entries[0]["parent_title"], "Acme")
        self.assertEqual(entries[0]["purge_at"], "2026-11-28T14:00:00.000Z")

    def test_restore_puts_it_back_under_its_parent_with_its_notes(self) -> None:
        acme = self.notes.create(None, "Acme")
        budget = self.notes.create(acme["id"], "Budget")
        self.notes.create(budget["id"], "Q1")
        self.notes.delete(budget["id"], recursive=True)
        self.assertEqual(self.titles(), ["Acme", "Keep"])
        restored = self.trash.restore(budget["id"])
        self.assertEqual(restored, {"id": budget["id"], "title": "Budget", "renamed": False})
        self.assertEqual(self.titles(), ["Acme", "Budget", "Keep", "Q1"])
        self.assertEqual(self.notes.get(budget["id"])["parent_id"], acme["id"])
        self.assertEqual(self.trash.entries(), [])

    def test_with_its_parent_still_trashed_it_goes_to_the_top_and_a_taken_title_gets_marked(self) -> None:
        acme = self.notes.create(None, "Acme")
        keep = self.notes.create(acme["id"], "Keep")
        self.at("2026-11-21T13:00:00.000Z")
        self.notes.delete(keep["id"])
        self.at("2026-11-21T14:00:00.000Z")
        self.notes.delete(acme["id"])
        restored = self.trash.restore(keep["id"])
        self.assertEqual((restored["title"], restored["renamed"]), ("Keep (restored)", True))
        self.assertIsNone(self.notes.get(keep["id"])["parent_id"])

    def test_a_meeting_waits_for_its_hub(self) -> None:
        hub = self.notes.create(None, "Rollout")
        self.notes.set_kind(hub["id"], "project")
        meeting_id, _ = MeetingRepository(self.db).create(hub["id"], "Kickoff", "2026-11-21")
        self.at("2026-11-21T13:00:00.000Z")
        self.notes.delete(meeting_id)
        self.at("2026-11-21T14:00:00.000Z")
        self.notes.delete(hub["id"])
        with self.assertRaises(StaysInAHub):
            self.trash.restore(meeting_id)
        self.trash.restore(hub["id"])
        self.trash.restore(meeting_id)
        self.assertEqual(self.notes.get(meeting_id)["kind"], "meeting")

    def test_restoring_a_live_note_is_not_found(self) -> None:
        with self.assertRaises(NotFound):
            self.trash.restore(self.keep["id"])

    def test_after_a_week_it_leaves_the_list_and_purge_deletes_it_with_its_rows(self) -> None:
        people = PeopleRepository(self.db)
        hub = self.notes.create(None, "Rollout")
        self.notes.set_kind(hub["id"], "area")
        project = self.notes.create(None, "Pilot")
        self.notes.set_kind(project["id"], "project")
        self.notes.set_area(project["id"], hub["id"])
        person_id, _ = people.create("Jane Doe")
        people.link(hub["id"], person_id, "Sponsor")
        meeting_id, _ = MeetingRepository(self.db).create(hub["id"], "Kickoff", "2026-11-21")
        self.notes.delete(hub["id"], recursive=True)
        self.notes.delete(person_id)
        self.at("2026-11-28T11:59:59.000Z")
        self.assertEqual(len(self.trash.entries()), 2)
        self.assertEqual(self.trash.purge(), 0)
        self.at("2026-11-28T12:00:00.000Z")
        self.assertEqual(self.trash.entries(), [])
        self.assertEqual(self.trash.purge(), 3)
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM notes").fetchone()[0], 2)
            for table in ("people", "hub_people", "meetings", "meeting_people"):
                self.assertEqual(conn.execute("SELECT count(*) FROM " + table).fetchone()[0], 0, table)
        self.assertIsNone(self.notes.get(project["id"])["area_id"])

    def test_an_image_another_note_links_to_outlives_its_note(self) -> None:
        images = ImageRepository(self.db, clock=self.clock)
        gone = self.notes.create(None, "Gone")
        image = images.add(gone["id"], png(2, 2))
        self.notes.save(self.keep["id"], "![x]({})".format(image["url"]), 1)
        self.notes.delete(gone["id"])
        self.at("2026-12-01T00:00:00.000Z")
        self.assertEqual(self.trash.purge(), 1)
        self.assertEqual(images.sweep_unused(self.notes.all_bodies), 0)
        self.assertEqual(images.get(image["id"]).mime, "image/png")
        self.notes.save(self.keep["id"], "", 2)
        self.assertEqual(images.sweep_unused(self.notes.all_bodies), 1)


if __name__ == "__main__":
    unittest.main()
