import tempfile
import unittest
from datetime import date
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.tasks_repo import TaskRepository
from paradigm.db.time_repo import BadSetting, TimeRepository
from paradigm.notes.tasks import Task
from paradigm.timesheet.holidays import BadRule, holiday_days, parse_rule
from paradigm.timesheet.report import Item, Off, Settings, scale, split_day, week_report, working_spans

MONDAY = date(2026, 11, 23)
SPANS = working_spans(8 * 60, 17 * 60, 12 * 60, 13 * 60)
SETTINGS = Settings("ADMIN", {"holiday": "HOL", "time_off": "VAC", "sick": "SCK"}, SPANS)


def item(day, start, end, code, label="x", hub="Hub"):
    return Item(MONDAY.replace(day=MONDAY.day + day), start * 60, end * 60, code, label, hub, "task")


class ReportMathTest(unittest.TestCase):
    def test_overlaps_share_each_minute(self) -> None:
        mix = split_day([item(0, 9, 11, "A"), item(0, 10, 12, "B")])
        self.assertEqual(mix, {"A": 90.0, "B": 90.0})

    def test_largest_remainder(self) -> None:
        self.assertEqual(scale({"A": 1, "B": 1, "C": 1}, 4), {"A": 2, "B": 1, "C": 1})
        self.assertEqual(scale({"A": 10}, 0), {})
        self.assertEqual(sum(scale({"A": 7, "B": 3, "C": 13}, 32).values()), 32)

    def test_a_week(self) -> None:
        report = week_report(MONDAY, [
            item(0, 9, 11, "A"), item(0, 10, 12, "B"),          # Monday: 3 h shared, lunch is free
            item(0, 12, 13, "A"),                               # at lunch: not counted
            item(1, 7, 9, "A"),                                 # Tuesday: 1 h inside the day
            item(2, 9, 10, "", hub="Reading"),                  # no code
        ], [(MONDAY, "Untimed", "Hub")], {date(2026, 11, 26): Off("holiday", 0, "Thanksgiving"),
                                          date(2026, 11, 27): Off("time_off", 240, "Errands")}, SETTINGS)
        hours = {row["code"]: row["hours"] for row in report["rows"]}
        self.assertEqual(hours["A"], [1.5, 1.0, 0, 0, 0])
        self.assertEqual(hours["B"], [1.5, 0, 0, 0, 0])
        self.assertEqual(hours["HOL"], [0, 0, 0, 8.0, 0])
        self.assertEqual(hours["VAC"], [0, 0, 0, 0, 4.0])
        self.assertEqual(hours["ADMIN"], [5.0, 7.0, 8.0, 0, 4.0])
        self.assertEqual(report["totals"], [8.0] * 5)
        self.assertEqual(report["total"], 40.0)
        self.assertEqual([entry["reason"] for entry in report["not_counted"]], ["no time", "no time code"])
        self.assertIn("No time code: Reading.", report["warnings"])

    def test_no_codes_set(self) -> None:
        report = week_report(MONDAY, [], [], {MONDAY: Off("sick", 0, "Sick")}, Settings("", {}, SPANS))
        self.assertEqual({row["code"] for row in report["rows"]}, {"DEFAULT", "SICK"})
        self.assertEqual(len(report["warnings"]), 2)


class HolidaysTest(unittest.TestCase):
    def test_rules(self) -> None:
        self.assertEqual(parse_rule("4th Thu of Nov + 1").on(2026), date(2026, 11, 27))
        self.assertEqual(parse_rule("last Monday of May").on(2026), date(2026, 5, 25))
        self.assertEqual(parse_rule("July 4th").on(2026), date(2026, 7, 4))
        self.assertIsNone(parse_rule("2026-12-24").on(2027))
        for bad in ("", "Smarch 3", "Feb 30", "9th Mon of May", "2026-02-30"):
            with self.assertRaises(BadRule):
                parse_rule(bad)

    def test_observed(self) -> None:
        days, bad = holiday_days([("NY", "Jan 1"), ("Odd", "nonsense")], date(2027, 12, 1), date(2027, 12, 31))
        self.assertEqual((days, bad), ({date(2027, 12, 31): "NY"}, ["Odd: nonsense"]))
        days, _ = holiday_days([("July", "Jul 4")], date(2026, 7, 1), date(2026, 7, 31), observed=False)
        self.assertEqual(list(days), [date(2026, 7, 4)])


class TimeRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.time = TimeRepository(self.db)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def hub(self, title, kind, code=""):
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], kind)
        self.notes.set_time_code(note["id"], code) if kind != "resource" else None
        return note["id"]

    def test_settings(self) -> None:
        settings = self.time.settings()
        self.assertEqual(settings["settings"]["day_start"], "08:00")
        self.assertEqual(len(settings["holidays"]), 12)
        settings = self.time.set_settings({"default_code": " ADM ", "observed": False, "lunch_start": "",
                                           "lunch_end": ""})
        self.assertEqual((settings["settings"]["default_code"], settings["settings"]["observed"]), ("ADM", "0"))
        for bad in ({"nope": 1}, {"day_end": "07:00"}, {"lunch_start": "12:00"}, {"observed": "yes"}):
            with self.assertRaises(BadSetting):
                self.time.set_settings(bad)
        settings = self.time.add_time_off("sick", "2026-11-24", "", 2.5, "Dentist")
        self.assertEqual(settings["time_off"][0]["hours"], 2.5)

    def test_a_week_from_meetings_and_tasks(self) -> None:
        self.time.set_settings({"default_code": "ADM"})
        area = self.hub("Ops", "area", "OPS")
        project = self.hub("Move", "project")
        self.notes.set_area(project, area)
        own = self.hub("Budget", "project", "BUD")
        meetings = MeetingRepository(self.db)
        meetings.create(own, "Sync", "2026-11-23", "09:00", "10:00")
        meetings.create(own, "Quick", "2026-11-23", "15:00")                      # 30 min
        cancelled, _ = meetings.create(own, "Gone", "2026-11-23", "13:00", "14:00")
        meetings.set_cancelled(cancelled, True)
        latest = self.notes.get(project)
        self.notes.save(project, "- [ ] Pack", latest["version"], links=[], tasks=[Task("body", 0, None, "Pack", False)])
        tasks = TaskRepository(self.db)
        tasks.add_session(tasks.list()[0]["id"], "2026-11-24", "13:00", "15:00")
        report = self.time.week(date(2026, 11, 25))
        hours = {row["code"]: row["hours"] for row in report["rows"]}
        self.assertEqual(hours["BUD"][0], 1.5)
        self.assertEqual(hours["OPS"][1], 2.0)                                      # the area's code
        self.assertEqual(report["total"], 40.0)


if __name__ == "__main__":
    unittest.main()
