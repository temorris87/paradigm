import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from calendar_samples import calendar, event
from paradigm.calendar import import_rules as rules
from paradigm.calendar.ics import BadCalendar, read_calendar, text_value, unfold
from paradigm.db.connection import Database
from paradigm.db.import_repo import ImportRepository
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.people_repo import PeopleRepository


def eastern(moment: datetime) -> datetime:
    """Local time for the tests: US Eastern in winter (the sample week is in November)."""
    return (moment.astimezone(timezone.utc) - timedelta(hours=5)).replace(tzinfo=None)


class IcsTest(unittest.TestCase):
    def test_lines_and_text(self) -> None:
        self.assertEqual(unfold("A:1\r\n B\r\n\tC\r\nD:2"), ["A:1BC", "D:2"])
        self.assertEqual(text_value(r"a\, b\; c\\d\ne"), "a, b; c\\d\ne")

    def test_times_follow_the_files_zone(self) -> None:
        summer = calendar([event("u1", "Summer", "20260715T100000", "20260715T103000")])
        found = read_calendar(summer, to_local=lambda moment: moment.astimezone(timezone.utc).replace(tzinfo=None))
        self.assertEqual(found.events[0].start, datetime(2026, 7, 15, 14, 0))     # EDT is UTC-4
        winter = calendar([event("u1", "Winter", "20261124T100000", "20261124T103000")])
        found = read_calendar(winter, to_local=eastern)
        self.assertEqual((found.events[0].start, found.events[0].end),
                         (datetime(2026, 11, 24, 10, 0), datetime(2026, 11, 24, 10, 30)))
        self.assertEqual(found.first, datetime(2026, 11, 23, 0, 0))
        self.assertEqual(found.owner_email, "me@acme.example")

    def test_not_a_calendar(self) -> None:
        with self.assertRaises(BadCalendar):
            read_calendar("hello")

    def test_rules(self) -> None:
        text = calendar([event("u", "Canceled: Plan / review #2 [x]", "20261124T100000", "20261124T110000",
                               ["LOCATION:Microsoft Teams Meeting; https://teams.microsoft.com/l/meetup-join/abc",
                                "DESCRIPTION:Agenda\\n* one\\n________________\\nClick here to join the meeting\\n________________\\nend"])])
        found = read_calendar(text, to_local=eastern).events[0]
        self.assertTrue(rules.is_cancelled(found, "me@acme.example"))
        self.assertEqual(rules.meeting_title(found.summary), "Plan - review 2 x")
        self.assertEqual(rules.join_url(found), "https://teams.microsoft.com/l/meetup-join/abc")
        self.assertEqual(rules.location(found), "Microsoft Teams Meeting")
        self.assertEqual(rules.agenda(found.description), "Agenda\n- one\nend")
        self.assertEqual([person.email for person in rules.attendees(found, "me@acme.example")],
                         ["priya.shah@acme.example", "dana.lee@northwind.example"])
        self.assertEqual(rules.split_person_name(rules.Person("Shah, Priya K.", "")), ("Priya", "Shah"))
        self.assertEqual(rules.split_person_name(rules.Person("", "dana.lee@x.example")), ("Dana", "Lee"))


class ImportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.meetings = MeetingRepository(self.db)
        self.today = "2026-11-23"
        self.imports = ImportRepository(self.db, Path(self.tmp.name) / "import", today=lambda: self.today,
                                        to_local=eastern)
        self.hub = self.notes.create(None, "Budget")["id"]
        self.notes.set_kind(self.hub, "project")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def run_import(self, *events, **range_):
        return self.imports.import_text(calendar(list(events), **range_))

    def test_a_new_one_off_waits_to_be_filed(self) -> None:
        counts = self.run_import(event("a", "Kickoff", "20261124T100000", "20261124T110000"))
        self.assertEqual(counts["to_file"], 1)
        pending = self.imports.pending()
        self.assertEqual([(each["title"], each["day"], each["time"], each["end_time"]) for each in pending],
                         [("Kickoff", "2026-11-24", "10:00", "11:00")])
        made = self.imports.file([pending[0]["id"]], self.hub)
        meeting = self.meetings.get(made[0])
        self.assertEqual((meeting["day"], meeting["time"], meeting["end_time"]), ("2026-11-24", "10:00", "11:00"))
        people = PeopleRepository(self.db).list()
        self.assertEqual(sorted((each["first"], each["last"], each["email"]) for each in people),
                         [("Dana", "Lee", "dana.lee@northwind.example"), ("Priya", "Shah", "priya.shah@acme.example")])
        self.assertEqual(len(meeting["attendees"]), 2)
        self.assertEqual(self.imports.pending(), [])
        self.assertTrue(self.imports.status()["imported_today"])
        # Next time the same name is guessed to go to the same hub.
        self.run_import(event("b", "Kickoff", "20261126T100000", "20261126T110000"))
        self.assertEqual(self.imports.pending()[0]["hub_guess"], self.hub)

    def file_one(self, uid="a", day="24", recurring=False):
        extra = ["RRULE:FREQ=WEEKLY;COUNT=1"] if recurring else []
        self.run_import(event(uid, "Sync", "202611{}T100000".format(day), "202611{}T103000".format(day), extra))
        return self.imports.file([self.imports.pending()[0]["id"]], self.hub)[0]

    def test_changes_in_outlook_follow(self) -> None:
        meeting = self.file_one()
        counts = self.run_import(event("a", "Sync", "20261124T140000", "20261124T150000"))
        self.assertEqual(counts["updated"], 1)
        self.assertEqual(self.meetings.get(meeting)["time"], "14:00")
        counts = self.run_import(event("a", "Sync", "20261126T090000", "20261126T093000"))
        self.assertEqual(counts["moved"], 1)
        self.assertEqual(self.meetings.get(meeting)["day"], "2026-11-26")
        counts = self.run_import(event("a", "Canceled: Sync", "20261126T090000", "20261126T093000",
                                       ["STATUS:CANCELLED"]))
        self.assertEqual(counts["cancelled"], 1)
        self.assertTrue(self.meetings.get(meeting)["cancelled"])
        counts = self.run_import(event("a", "Sync", "20261126T090000", "20261126T093000"))
        self.assertEqual(counts["back_on"], 1)
        self.assertFalse(self.meetings.get(meeting)["cancelled"])

    def test_a_meeting_missing_from_the_export_is_cancelled(self) -> None:
        meeting = self.file_one()
        self.run_import(event("other", "Else", "20261125T100000", "20261125T103000"),
                        first="20261201T050000Z", last="20261208T050000Z")
        self.assertFalse(self.meetings.get(meeting)["cancelled"])     # outside that range
        counts = self.run_import(event("other", "Else", "20261125T100000", "20261125T103000"))
        self.assertEqual(counts["cancelled"], 1)
        self.assertTrue(self.meetings.get(meeting)["cancelled"])

    def test_a_series_goes_where_it_went_before(self) -> None:
        self.file_one(uid="s", recurring=True)
        counts = self.run_import(event("s", "Sync", "20261201T100000", "20261201T103000", ["RRULE:FREQ=WEEKLY;COUNT=1"]),
                                 first="20261130T050000Z", last="20261207T050000Z")
        self.assertEqual((counts["new"], counts["to_file"]), (1, 0))
        self.assertEqual(sorted(each["day"] for each in self.meetings.list()), ["2026-11-24", "2026-12-01"])

    def test_skipped_and_ignored(self) -> None:
        counts = self.run_import(
            event("f", "Focus", "20261124T100000", "20261124T110000", ["X-MICROSOFT-CDO-BUSYSTATUS:FREE"]),
            "BEGIN:VEVENT\nUID:h\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:20261126\nEND:VEVENT",
            event("n", "Maybe", "20261125T100000", "20261125T110000"))
        self.assertEqual((counts["skipped"], counts["to_file"]), (2, 1))
        self.imports.ignore([self.imports.pending()[0]["id"]])
        self.run_import(event("n", "Maybe", "20261125T100000", "20261125T110000"))
        self.assertEqual(self.imports.pending(), [])

    def test_a_trashed_meeting_is_not_made_again(self) -> None:
        meeting = self.file_one()
        self.notes.delete(meeting)
        counts = self.run_import(event("a", "Sync", "20261124T100000", "20261124T103000"))
        self.assertEqual((counts["new"], counts["to_file"]), (0, 0))

    def test_the_folder(self) -> None:
        folder = Path(self.tmp.name) / "import"
        folder.mkdir()
        (folder / "week.ICS").write_text(calendar([event("a", "Sync", "20261124T100000", "20261124T103000")]),
                                         encoding="utf-8")
        (folder / "bad.ics").write_text("nope", encoding="utf-8")
        self.assertEqual(self.imports.status()["waiting"], 2)
        counts = self.imports.import_folder()
        self.assertEqual((counts["files"], counts["to_file"], len(counts["errors"])), (1, 1, 1))
        self.assertEqual(sorted(path.name for path in folder.iterdir()), ["bad.ics.unreadable"])


if __name__ == "__main__":
    unittest.main()
