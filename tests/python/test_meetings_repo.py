import itertools
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.meetings_repo import (BadTitle, BadWhen, HubArchived, MeetingRepository, NotAHub,
                                       NotAMeeting, NotAPerson, NotAttending)
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import StaysInAHub, NoteRepository, TitleTaken
from paradigm.db.people_repo import PeopleRepository
from paradigm.notes.meetings import clean_day, clean_time, retitle


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

    def test_retitle_swaps_only_a_leading_date(self) -> None:
        self.assertEqual(retitle("2026-11-24 Kickoff", "2026-11-24", "2026-11-25"), "2026-11-25 Kickoff")
        self.assertEqual(retitle("Kickoff 2026-11-24", "2026-11-24", "2026-11-25"), "Kickoff 2026-11-24")


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
        self.assertEqual(meeting, {"id": note_id, "day": "2026-11-24", "time": "14:00", "attendees": []})
        note = self.notes.get(note_id)
        self.assertEqual((note["title"], note["parent_id"], note["kind"]), ("2026-11-24 Kickoff", hub, "meeting"))
        self.assertEqual(self.meetings.list(), [meeting])

    def test_same_name_on_two_days_but_not_one(self) -> None:
        hub = self.hub()
        self.meeting(hub, "Weekly sync", "2026-11-24")
        self.meeting(hub, "Weekly sync", "2026-12-01")
        with self.assertRaises(TitleTaken):
            self.meeting(hub, "weekly sync", "2026-11-24")

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

    def test_update_moves_the_date_in_the_title(self) -> None:
        hub = self.hub()
        meeting = self.meeting(hub, day="2026-11-24")
        got = self.meetings.update(meeting, "2026-11-25", "09:30")
        self.assertEqual((got["day"], got["time"]), ("2026-11-25", "09:30"))
        self.assertEqual(self.notes.get(meeting)["title"], "2026-11-25 Kickoff")
        self.notes.rename(meeting, "Kickoff, moved")
        self.meetings.update(meeting, "2026-11-26")
        self.assertEqual(self.notes.get(meeting)["title"], "Kickoff, moved")
        self.assertEqual(self.meetings.get(meeting)["time"], "")

    def test_update_refuses_a_title_clash(self) -> None:
        hub = self.hub()
        self.meeting(hub, day="2026-11-25")
        meeting = self.meeting(hub, day="2026-11-24")
        with self.assertRaises(TitleTaken):
            self.meetings.update(meeting, "2026-11-25")
        self.assertEqual(self.meetings.get(meeting)["day"], "2026-11-24")

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
        self.assertEqual(self.notes.move(meeting, folder)["parent_id"], folder)
        for where in (None, self.notes.create(None, "Loose")["id"], self.person()):
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
