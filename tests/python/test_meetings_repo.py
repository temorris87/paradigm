import itertools
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.meetings_repo import (BadTitle, BadWhen, HubArchived, MeetingRepository, NotAHub,
                                       NotAMeeting, NotAPerson, NotAttending)
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import Conflict, NoNotesUnder, StaysInAHub, NoteRepository
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.links_repo import LinkRepository
from paradigm.notes.meetings import clean_day, clean_time
from paradigm.notes.mentions import Mention


class MeetingRulesTest(unittest.TestCase):
    def test_days(self) -> None:
        self.assertEqual(clean_day("2026-11-24"), "2026-11-24")
        for bad in ("2026-02-30", "24/11/2026", "2026-1-4", "", None, 20261124):
            with self.assertRaises(BadWhen):
                clean_day(bad)

    def test_times(self) -> None:
        self.assertEqual(clean_time("09:30"), "09:30")
        self.assertEqual(clean_time(""), "")
        self.assertEqual(clean_time(None), "")
        for bad in ("9:30", "24:00", "12:60", "ab:cd", "12-30", 930):
            with self.assertRaises(BadWhen):
                clean_time(bad)



class MeetingRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        ticks = itertools.count(1)
        clock = lambda: "2026-01-01T00:00:{:02d}Z".format(next(ticks) % 60)  # noqa: E731
        self.notes = NoteRepository(self.db, clock=clock)
        self.people = PeopleRepository(self.db, clock=clock)
        self.meetings = MeetingRepository(self.db, clock=clock)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def hub(self, title="Rollout", kind="project") -> int:
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], kind)
        return note["id"]

    def person(self, name="Jane Doe") -> int:
        return self.people.create(name)[0]

    def meeting(self, hub_id, name="Kickoff", day="2026-11-24", time="") -> int:
        return self.meetings.create(hub_id, name, day, time)[0]

    def test_a_meeting_is_a_dated_note_under_its_hub(self) -> None:
        hub = self.hub()
        note_id, meeting = self.meetings.create(hub, "  Kickoff ", "2026-11-24", "14:00")
        self.assertEqual(meeting, {"id": note_id, "day": "2026-11-24", "time": "14:00", "attendees": [],
                                   "agenda_version": 1})
        note = self.notes.get(note_id)
        self.assertEqual((note["title"], note["parent_id"], note["kind"]), ("Kickoff", hub, "meeting"))
        self.assertEqual((note["agenda"], note["agenda_version"]), ("", 1))
        self.assertEqual(self.meetings.list(), [meeting])

    def test_meetings_in_a_hub_may_share_a_name(self) -> None:
        hub = self.hub()
        first = self.meeting(hub, "Weekly sync", "2026-11-24")
        second = self.meeting(hub, "Weekly sync", "2026-11-24")
        self.assertEqual({self.notes.get(each)["title"] for each in (first, second)}, {"Weekly sync"})
        self.notes.create(hub, "Weekly sync")  # a note beside them too
        self.notes.rename(first, "weekly sync")

    def test_a_meeting_has_no_notes_under_it(self) -> None:
        hub = self.hub()
        meeting = self.meeting(hub)
        with self.assertRaises(NoNotesUnder):
            self.notes.create(meeting, "Part two")
        loose = self.notes.create(hub, "Loose")["id"]
        with self.assertRaises(NoNotesUnder):
            self.notes.move(loose, meeting)

    def test_the_agenda_saves_with_its_own_version(self) -> None:
        meeting = self.meeting(self.hub())
        saved = self.meetings.save_agenda(meeting, "1. Dates @Jane", 1, links=["Plan"],
                                          mentions=[Mention("agenda", 0, "Jane", "1. Dates @Jane")])
        self.assertEqual(saved, {"id": meeting, "agenda": "1. Dates @Jane", "version": 2})
        self.assertEqual(self.notes.get(meeting)["version"], 1)
        with self.assertRaises(Conflict):
            self.meetings.save_agenda(meeting, "older", 1)
        self.assertEqual(self.meetings.save_agenda(meeting, "mine", 1, force=True)["version"], 3)
        index = LinkRepository(self.db).index()
        self.assertEqual(index["links"], [{"id": meeting, "targets": ["Plan"]}])
        self.assertEqual(index["mentions"][0]["field"], "agenda")
        self.assertIn("mine", self.notes.all_bodies())

    def test_meetings_go_only_in_a_live_hub(self) -> None:
        inbox = self.notes.create(None, "Loose")["id"]
        jane = self.person()
        child = self.notes.create(self.hub(), "Inside")["id"]
        for where in (inbox, jane, child):
            with self.assertRaises(NotAHub):
                self.meeting(where)
        area = self.hub("Operations", "area")
        self.notes.set_archived(area, True)
        with self.assertRaises(HubArchived):
            self.meeting(area)
        with self.assertRaises(BadTitle):
            self.meeting(self.hub("Pilot"), "  ")
        with self.assertRaises(BadWhen):
            self.meeting(self.hub("Other"), "X", "tomorrow")

    def test_update_leaves_the_title(self) -> None:
        hub = self.hub()
        meeting = self.meeting(hub, day="2026-11-24")
        got = self.meetings.update(meeting, "2026-11-25", "09:30")
        self.assertEqual((got["day"], got["time"]), ("2026-11-25", "09:30"))
        self.assertEqual(self.notes.get(meeting)["title"], "Kickoff")
        self.meetings.update(meeting, "2026-11-26")
        self.assertEqual(self.meetings.get(meeting)["time"], "")

    def test_attend_and_unattend(self) -> None:
        meeting = self.meeting(self.hub())
        jane, bob = self.person(), self.person("Bob Lee")
        got, added = self.meetings.attend(meeting, [jane, bob])
        self.assertEqual((got["attendees"], added), ([jane, bob], [jane, bob]))
        self.assertEqual(self.meetings.attend(meeting, [jane])[1], [])
        self.assertEqual(self.meetings.unattend(meeting, jane)["attendees"], [bob])
        with self.assertRaises(NotAttending):
            self.meetings.unattend(meeting, jane)
        with self.assertRaises(NotAPerson):
            self.meetings.attend(meeting, [self.notes.create(None, "Thing")["id"]])
        with self.assertRaises(NotAMeeting):
            self.meetings.attend(self.hub("Pilot"), [jane])

    def test_trashed_people_and_meetings_are_skipped_and_come_back(self) -> None:
        hub = self.hub()
        meeting = self.meeting(hub)
        jane = self.person()
        self.meetings.attend(meeting, [jane])
        self.notes.delete(jane)
        self.assertEqual(self.meetings.get(meeting)["attendees"], [])
        self.notes.delete(meeting)
        self.assertEqual(self.meetings.list(), [])

    def test_a_meeting_stays_inside_a_hub(self) -> None:
        hub = self.hub()
        other = self.hub("Pilot")
        meeting = self.meeting(hub)
        folder = self.notes.create(other, "Meetings")["id"]
        self.assertEqual(self.notes.move(meeting, other)["parent_id"], other)
        for where in (None, self.notes.create(None, "Loose")["id"], self.person(), folder):
            with self.assertRaises(StaysInAHub):
                self.notes.move(meeting, where)
        with self.assertRaises(StaysInAHub):
            self.notes.set_kind(meeting, "project")

    def test_archiving_the_hub_keeps_its_meetings(self) -> None:
        hub = self.hub()
        meeting = self.meeting(hub)
        self.notes.set_archived(hub, True)
        self.assertEqual([each["id"] for each in self.meetings.list()], [meeting])


if __name__ == "__main__":
    unittest.main()
