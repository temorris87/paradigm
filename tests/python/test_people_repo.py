import itertools
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import BadTitle, IsAPerson, NoteRepository, NotAnArea, TitleTaken
from paradigm.db.people_repo import BadField, NotAHub, NotAPerson, NotFound, NotLinked, PeopleRepository


class PeopleRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        ticks = itertools.count(1)
        clock = lambda: "2026-01-01T00:00:{:02d}Z".format(next(ticks) % 60)  # noqa: E731
        self.notes = NoteRepository(self.db, clock=clock)
        self.people = PeopleRepository(self.db, clock=clock)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def person(self, name="Jane Doe") -> int:
        note_id, _ = self.people.create(name)
        return note_id

    def hub(self, title="Rollout", kind="project") -> int:
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], kind)
        return note["id"]

    def test_a_person_is_a_top_level_note_reported_as_a_person(self) -> None:
        note_id, person = self.people.create("  Jane   Doe ")
        self.assertEqual(person, {"id": note_id, "first": "Jane", "last": "Doe", "email": "", "phone": "",
                                  "org": "", "job": "", "hubs": []})
        note = self.notes.get(note_id)
        self.assertEqual((note["title"], note["parent_id"], note["kind"]), ("Jane Doe", None, "person"))
        kinds = {each["title"]: each["kind"] for each in self.notes.tree()}
        self.assertEqual(kinds["Jane Doe"], "person")

    def test_the_name_must_be_free_at_the_top_level(self) -> None:
        self.hub("Operations", "area")
        with self.assertRaises(TitleTaken):
            self.people.create("operations")
        with self.assertRaises(BadTitle):
            self.people.create("a/b")
        self.assertEqual(self.people.list(), [])

    def test_fields_are_set_and_cleared(self) -> None:
        jane = self.person()
        self.people.update(jane, "org", "  Northwind  ")
        self.people.update(jane, "job", "Data engineer")
        person = self.people.update(jane, "email", "jane@example.com")
        self.assertEqual((person["org"], person["job"], person["email"]),
                         ("Northwind", "Data engineer", "jane@example.com"))
        self.assertEqual(self.people.update(jane, "org", "")["org"], "")

    def test_names_make_the_title(self) -> None:
        priya = self.people.create(first="Priya", last="Shah")[0]
        self.assertEqual(self.notes.get(priya)["title"], "Priya Shah")
        self.people.update(priya, "last", "Shah-Lee")
        self.assertEqual(self.notes.get(priya)["title"], "Priya Shah-Lee")
        self.people.update(priya, "phone", "+1 (555) 010-0100")
        self.notes.rename(priya, "Priya Lee")
        self.assertEqual((self.people.get(priya)["first"], self.people.get(priya)["last"]), ("Priya", "Lee"))
        self.people.create("Sam Lee")
        with self.assertRaises(TitleTaken):
            self.people.update(priya, "first", "Sam")

    def test_bad_fields(self) -> None:
        jane = self.person()
        for field, value in [("phone", "call me"), ("fax", "1"), ("email", "Jane Doe"), ("org", 5), ("job", "x" * 201),
                             ("org", "bell\x07")]:
            with self.subTest(field=field, value=value), self.assertRaises(BadField):
                self.people.update(jane, field, value)

    def test_only_a_person_has_fields(self) -> None:
        hub = self.hub()
        with self.assertRaises(NotAPerson):
            self.people.update(hub, "org", "Acme")
        with self.assertRaises(NotFound):
            self.people.update(999, "org", "Acme")

    def test_link_changes_the_role_the_second_time(self) -> None:
        jane, hub = self.person(), self.hub()
        person, created = self.people.link(hub, jane, " Sponsor ")
        self.assertTrue(created)
        self.assertEqual(person["hubs"], [{"hub_id": hub, "role": "Sponsor"}])
        person, created = self.people.link(hub, jane, "Lead")
        self.assertFalse(created)
        self.assertEqual(person["hubs"], [{"hub_id": hub, "role": "Lead"}])
        self.assertEqual(self.people.link(hub, jane, None)[0]["hubs"][0]["role"], "")

    def test_people_go_only_on_hubs(self) -> None:
        jane, bob = self.person(), self.person("Bob Smith")
        inbox = self.notes.create(None, "Loose")["id"]
        hub = self.hub()
        nested = self.notes.create(hub, "Kickoff")["id"]
        for target in [inbox, nested, bob]:
            with self.subTest(target=target), self.assertRaises(NotAHub):
                self.people.link(target, jane, "")
        with self.assertRaises(NotAPerson):
            self.people.link(hub, inbox, "")

    def test_unlink(self) -> None:
        jane, hub = self.person(), self.hub()
        self.people.link(hub, jane, "Sponsor")
        self.assertEqual(self.people.unlink(hub, jane)["hubs"], [])
        with self.assertRaises(NotLinked):
            self.people.unlink(hub, jane)

    def test_a_trashed_person_leaves_the_list_and_comes_back_with_links(self) -> None:
        jane, hub = self.person(), self.hub()
        self.people.link(hub, jane, "Sponsor")
        self.notes.delete(jane)
        self.assertEqual(self.people.list(), [])
        with self.db.transaction() as conn:
            conn.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?", (jane,))
        self.assertEqual(self.people.list()[0]["hubs"], [{"hub_id": hub, "role": "Sponsor"}])

    def test_links_to_a_trashed_hub_are_not_listed(self) -> None:
        jane, hub = self.person(), self.hub()
        self.people.link(hub, jane, "Sponsor")
        self.notes.delete(hub)
        self.assertEqual(self.people.get(jane)["hubs"], [])

    def test_archiving_a_hub_or_person_keeps_the_links(self) -> None:
        jane, hub = self.person(), self.hub()
        self.people.link(hub, jane, "Sponsor")
        self.notes.set_archived(hub, True)
        self.notes.set_archived(jane, True)
        self.assertEqual(self.people.list()[0]["hubs"], [{"hub_id": hub, "role": "Sponsor"}])

    def test_a_person_is_never_filed_or_nested(self) -> None:
        jane, hub = self.person(), self.hub()
        with self.assertRaises(IsAPerson):
            self.notes.set_kind(jane, "project")
        with self.assertRaises(IsAPerson):
            self.notes.set_kind(jane, None)
        with self.assertRaises(IsAPerson):
            self.notes.move(jane, hub)
        self.notes.move(jane, None)
        child = self.notes.create(jane, "1:1 notes")
        self.assertEqual(child["parent_id"], jane)

    def test_a_person_is_not_an_area(self) -> None:
        jane, project = self.person(), self.hub()
        with self.assertRaisesRegex(NotAnArea, "a person"):
            self.notes.set_area(project, jane)

    def test_rename_renames_the_person(self) -> None:
        jane = self.person()
        self.notes.rename(jane, "Jane Smith")
        self.assertEqual(self.notes.get(jane)["title"], "Jane Smith")
        self.assertEqual(self.notes.get(jane)["kind"], "person")


if __name__ == "__main__":
    unittest.main()
