import itertools
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoNotesUnder, NoteRepository, StaysInAHub
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.records_repo import (BadKind, BadWhen, HubArchived, NotAHub, NotAPerson, NotAQuestion,
                                      NotARecord, NotAnswered, NotInvolved, RecordRepository)


class RecordRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        ticks = itertools.count(1)
        clock = lambda: "2026-01-01T00:00:{:02d}Z".format(next(ticks) % 60)  # noqa: E731
        self.notes = NoteRepository(self.db, clock=clock)
        self.people = PeopleRepository(self.db, clock=clock)
        self.meetings = MeetingRepository(self.db, clock=clock)
        self.records = RecordRepository(self.db, clock=clock)
        self.hub = self.notes.create(None, "Rollout")["id"]
        self.notes.set_kind(self.hub, "project")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def make(self, kind="decision", title="Use Postgres", parent=None, day="2026-11-24") -> int:
        return self.records.create(self.hub if parent is None else parent, kind, title, day)[0]

    def test_a_decision_is_a_note_under_the_hub(self) -> None:
        note_id, record = self.records.create(self.hub, "decision", "Use Postgres", "2026-11-24")
        self.assertEqual(record, {"id": note_id, "kind": "decision", "day": "2026-11-24", "people": [],
                                  "source_id": None, "quote": "", "quote_found": False})
        note = self.notes.get(note_id)
        self.assertEqual((note["parent_id"], note["title"], note["kind"]), (self.hub, "Use Postgres", "decision"))

    def test_a_question_starts_open_and_can_be_answered_and_reopened(self) -> None:
        question = self.make("question", "Who owns the feed?")
        self.assertEqual(self.records.get(question)["answered"], "")
        self.assertEqual(self.notes.get(question)["kind"], "question")
        self.assertEqual(self.records.answer(question, "2026-11-25")["answered"], "2026-11-25")
        self.assertEqual(self.records.reopen(question)["answered"], "")
        with self.assertRaises(NotAnswered):
            self.records.reopen(question)
        with self.assertRaises(NotAQuestion):
            self.records.answer(self.make(), "2026-11-25")

    def test_from_a_meeting_it_sits_under_the_hub(self) -> None:
        meeting = self.meetings.create(self.hub, "Kickoff", "2026-11-24")[0]
        decision = self.make(parent=meeting)
        self.assertEqual(self.notes.get(decision)["parent_id"], self.hub)
        self.assertEqual(self.records.get(decision)["source_id"], meeting)
        with self.assertRaises(NoNotesUnder):
            self.notes.create(meeting, "Minutes part two")

    def test_from_selected_text_in_a_note_deep_in_the_hub(self) -> None:
        plan = self.notes.create(self.hub, "Plan")["id"]
        deep = self.notes.create(plan, "Detail", "Who owns the feed? Nobody yet")["id"]
        question, record = self.records.create(deep, "question", "Who owns the feed?", "2026-11-24",
                                               quote="Who owns the feed?")
        self.assertEqual(self.notes.get(question)["parent_id"], self.hub)
        self.assertEqual((record["source_id"], record["quote"], record["quote_found"]), (deep, "Who owns the feed?", True))
        self.notes.save(deep, "It changed", self.notes.get(deep)["version"])
        self.assertFalse(self.records.get(question)["quote_found"])
        other = self.notes.create(None, "Elsewhere")["id"]
        with self.assertRaises(NotAHub):
            self.records.create(self.hub, "question", "Why?", "2026-11-24", source_id=other)

    def test_answer_text_goes_into_its_note(self) -> None:
        question = self.make("question", "Who owns the feed?")
        self.records.answer(question, "2026-11-25", "  Priya, from December ")
        self.assertEqual(self.notes.get(question)["body"], "Priya, from December\n")
        self.records.answer(question, "2026-11-26", "Confirmed")
        self.assertEqual(self.notes.get(question)["body"], "Priya, from December\n\nConfirmed\n")

    def test_only_from_a_hub_or_a_note_in_one(self) -> None:
        loose = self.notes.create(None, "Loose")["id"]
        person = self.people.create("Jane Doe")[0]
        for parent in (loose, person):
            with self.assertRaises(NotAHub):
                self.make(parent=parent)
        self.notes.set_archived(self.hub, True)
        with self.assertRaises(HubArchived):
            self.make()

    def test_bad_input(self) -> None:
        with self.assertRaises(BadKind):
            self.make(kind="task")
        with self.assertRaises(BadWhen):
            self.make(day="tomorrow")
        self.make()
        self.make()  # records may share a title
        with self.assertRaises(NotARecord):
            self.records.set_day(self.hub, "2026-11-24")

    def test_set_day(self) -> None:
        decision = self.make()
        self.assertEqual(self.records.set_day(decision, "2026-11-20")["day"], "2026-11-20")
        question = self.make("question", "Why?")
        self.assertEqual(self.records.set_day(question, "2026-11-21")["day"], "2026-11-21")

    def test_people(self) -> None:
        decision = self.make()
        jane, bob = self.people.create("Jane Doe")[0], self.people.create("Bob Lee")[0]
        record, added = self.records.involve(decision, [jane, bob, jane])
        self.assertEqual((record["people"], added), ([jane, bob], [jane, bob]))
        self.assertEqual(self.records.involve(decision, [jane])[1], [])
        with self.assertRaises(NotAPerson):
            self.records.involve(decision, [self.hub])
        self.assertEqual(self.records.uninvolve(decision, jane)["people"], [bob])
        with self.assertRaises(NotInvolved):
            self.records.uninvolve(decision, jane)
        self.notes.delete(bob)
        self.assertEqual(self.records.get(decision)["people"], [])

    def test_list_skips_trashed_notes(self) -> None:
        decision, question = self.make(), self.make("question", "Why?")
        self.assertEqual([r["id"] for r in self.records.list()], [decision, question])
        self.notes.delete(decision)
        self.assertEqual([r["id"] for r in self.records.list()], [question])

    def test_it_stays_inside_a_hub(self) -> None:
        decision = self.make()
        other = self.notes.create(None, "Ops")["id"]
        with self.assertRaises(StaysInAHub):
            self.notes.move(decision, None)
        with self.assertRaises(StaysInAHub):
            self.notes.move(decision, other)  # Inbox
        with self.assertRaises(StaysInAHub):
            self.notes.set_kind(decision, "project")
        self.notes.set_kind(other, "area")
        self.assertEqual(self.notes.move(decision, other)["parent_id"], other)
        inside = self.notes.create(other, "Plan")["id"]
        with self.assertRaises(StaysInAHub):
            self.notes.move(decision, inside)


if __name__ == "__main__":
    unittest.main()
