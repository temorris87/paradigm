"""Phases, milestones and their date history; plan templates; note templates; OneDrive files;
and the Trash purging all of their rows."""
import tempfile
import unittest
from datetime import date
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.files_repo import FileRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository, NoNotesUnder, StaysInAHub
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.plan_repo import HasMilestones, NotInAProject, PlanRepository
from paradigm.db.plan_templates_repo import BadPlan, PlanTemplateRepository
from paradigm.db.tasks_repo import TaskRepository
from paradigm.db.templates_repo import TemplateRepository
from paradigm.db.trash_repo import TrashRepository
from paradigm.files.folders import BadFolder, inside
from paradigm.notes.days import add_working_days, working_days_between
from paradigm.notes.meetings import BadWhen


class Clock:
    def __init__(self) -> None:
        self.now = "2026-11-21T12:00:00.000Z"

    def __call__(self) -> str:
        return self.now


class Repos(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name) / "data")
        migrate(self.db)
        self.clock = Clock()
        self.notes = NoteRepository(self.db, clock=self.clock)
        self.notes.create(None, "Keep")
        self.plan = PlanRepository(self.db, clock=self.clock, today=lambda: "2026-11-21")
        self.tasks = TaskRepository(self.db, clock=self.clock, today=lambda: "2026-11-21")
        self.templates = PlanTemplateRepository(self.db, self.tasks, clock=self.clock)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def hub(self, title, kind):
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], kind)
        return note["id"]


class WorkingDaysTest(unittest.TestCase):
    def test_counting(self) -> None:
        friday = date(2026, 11, 20)
        self.assertEqual(add_working_days(friday, 1), date(2026, 11, 23))
        self.assertEqual(add_working_days(date(2026, 11, 21), 0), date(2026, 11, 23))    # Saturday -> Monday
        thanksgiving = {date(2026, 11, 26), date(2026, 11, 27)}
        self.assertEqual(add_working_days(date(2026, 11, 25), 1, thanksgiving), date(2026, 11, 30))
        self.assertEqual(working_days_between(date(2026, 11, 23), date(2026, 11, 30), thanksgiving), 3)
        self.assertEqual(working_days_between(date(2026, 11, 30), date(2026, 11, 23)), -5)


class PlanTest(Repos):
    def test_phases_milestones_and_their_history(self) -> None:
        project = self.hub("Pilot", "project")
        design = self.plan.create_phase(project, "Design", "2026-11-02", "2026-11-13")
        self.notes.create(design, "Sketches")                                   # a phase holds notes
        live = self.plan.create_milestone(design, "Go-live", "2026-12-18")
        self.plan.create_milestone(project, "Go-live", "2027-01-08")            # titles may repeat
        with self.assertRaises(NoNotesUnder):
            self.notes.create(live, "Under a milestone")
        with self.assertRaises(BadWhen):
            self.plan.create_phase(project, "Backwards", "2026-11-13", "2026-11-02")
        area = self.hub("Ops", "area")
        with self.assertRaises(NotInAProject):
            self.plan.create_phase(area, "Nope", "2026-11-02", "2026-11-03")
        with self.assertRaises(StaysInAHub):
            self.notes.move(design, area)
        self.assertEqual(self.notes.get(design)["kind"], "phase")
        self.assertEqual(self.notes.get(live)["kind"], "milestone")

        self.clock.now = "2026-11-10T09:00:00.000Z"
        made = self.plan.set_dates(design, {"end": "2026-11-20"}, "vendor late")
        self.assertEqual([(c["field"], c["old"], c["new"], c["reason"]) for c in made],
                         [("end", "2026-11-13", "2026-11-20", "vendor late")])
        self.assertEqual(self.plan.set_dates(design, {"end": "2026-11-20"}), [])  # no change, nothing logged
        self.plan.set_dates(live, {"day": "2026-12-23"})
        plan = self.plan.plan()
        phase = next(p for p in plan["phases"] if p["id"] == design)
        self.assertEqual((phase["baseline_end"], phase["end"]), ("2026-11-13", "2026-11-20"))
        self.assertEqual(len(plan["changes"]), 2)
        self.assertEqual(self.plan.set_milestone_done(live, True)["done_day"], "2026-11-21")
        with self.assertRaises(HasMilestones):
            self.plan.unmake_phase(design)

    def test_a_plain_note_becomes_a_phase(self) -> None:
        project = self.hub("Pilot", "project")
        note = self.notes.create(project, "Testing")["id"]
        self.plan.make_phase(note, "2026-12-01", "2026-12-10")
        self.assertEqual(self.notes.get(note)["kind"], "phase")
        self.plan.unmake_phase(note)
        self.assertIsNone(self.notes.get(note)["kind"])


class PlanTemplateTest(Repos):
    def test_apply_and_save(self) -> None:
        area = self.hub("Grid ops", "area")
        template = self.templates.create(area, "Substation upgrade")
        template = self.templates.add_item(template["id"], "phase", "Design", 0, 4)
        design = template["items"][0]["id"]
        template = self.templates.add_item(template["id"], "milestone", "Sign-off", 4, phase_id=design)
        template = self.templates.add_item(template["id"], "phase", "Build", 5, 14)
        template = self.templates.add_task(design, "Load study")
        parent = template["items"][0]["tasks"][0]["id"]
        template = self.templates.add_task(design, "Collect data", parent)
        with self.assertRaises(BadPlan):
            self.templates.add_item(template["id"], "phase", "Bad", 5, 2)

        project = self.hub("Pilot", "project")
        self.notes.set_area(project, area)
        counts = self.templates.apply(template["id"], project, "2026-11-23")   # Thanksgiving week
        self.assertEqual(counts, {"phases": 2, "milestones": 1, "tasks": 2})
        plan = self.plan.plan()
        days = sorted((p["start"], p["end"]) for p in plan["phases"])
        # Mon 23, Tue 24, Wed 25, (Thu 26 + Fri 27 off), Mon 30, Tue 1 Dec: day 4.
        self.assertEqual(days[0], ("2026-11-23", "2026-12-01"))
        self.assertEqual(plan["milestones"][0]["day"], "2026-12-01")
        tasks = self.tasks.list()
        self.assertEqual([t["title"] for t in tasks], ["Load study", "Collect data"])
        self.assertEqual(tasks[1]["parent_id"], tasks[0]["id"])
        self.assertEqual(self.templates.applied()[0]["title"], "Substation upgrade")
        # Applied again: the phases get free titles, nothing is replaced.
        self.templates.apply(template["id"], project, "2027-01-04")
        titles = {self.notes.get(p["id"])["title"] for p in self.plan.plan()["phases"]}
        self.assertIn("Design (2)", titles)

        saved = self.templates.save_from(project, "From Pilot")
        self.assertEqual(saved["area_id"], area)
        first = min(item["start"] for item in saved["items"])
        self.assertEqual(first, 0)
        self.assertEqual(sum(len(item["tasks"]) for item in saved["items"]), 4)


class NoteTemplateTest(Repos):
    def test_a_template_is_its_own_kind(self) -> None:
        templates = TemplateRepository(self.db, clock=self.clock)
        note_id = templates.create("Site visit", "# Site visit {{date}}\n- [ ] Photos\n")
        note = self.notes.get(note_id)
        self.assertEqual((note["kind"], note["parent_id"]), ("template", None))
        project = self.hub("Pilot", "project")
        for change in (lambda: self.notes.move(note_id, project), lambda: self.notes.set_kind(note_id, "project")):
            with self.assertRaises(Exception):
                change()


class FilesTest(Repos):
    def test_folder_scan_attach_and_open(self) -> None:
        folder = Path(self.tmp.name) / "OneDrive" / "Pilot"
        (folder / "Design").mkdir(parents=True)
        (folder / "Design" / "Load study.xlsx").write_bytes(b"x")
        (folder / "~$Load study.xlsx").write_bytes(b"lock")
        (folder / "Quote.pdf").write_bytes(b"pdf")
        opened = []
        files = FileRepository(self.db, clock=self.clock, opener=opened.append)
        project = self.hub("Pilot", "project")
        result = files.link_folder(project, str(folder))
        self.assertEqual(result["added"], 2)
        listed = files.all()
        self.assertEqual(sorted(f["rel_path"] for f in listed["files"]), ["Design/Load study.xlsx", "Quote.pdf"])
        quote = next(f for f in listed["files"] if f["name"] == "Quote.pdf")
        meeting_note = self.notes.create(project, "Kickoff notes")["id"]
        files.attach(quote["id"], meeting_note)
        files.attach(quote["id"], project)
        self.assertEqual(len(files.all()["links"]), 2)
        files.open(quote["id"])
        self.assertEqual(opened, [(folder / "Quote.pdf").resolve()])
        (folder / "Quote.pdf").unlink()
        (folder / "New.docx").write_bytes(b"d")
        rescanned = files.scan(result["folder"]["id"])
        self.assertEqual((rescanned["added"], rescanned["missing"]), (1, 1))
        self.assertTrue(next(f for f in files.all()["files"] if f["id"] == quote["id"])["missing"])
        with self.assertRaises(BadFolder):
            files.link_folder(project, str(folder / "nope"))
        with self.assertRaises(BadFolder):
            inside(folder, "../escape.txt")


class PurgeTest(Repos):
    def test_purge_removes_every_row(self) -> None:
        project = self.hub("Pilot", "project")
        area = self.hub("Ops", "area")
        self.notes.set_area(project, area)
        phase = self.plan.create_phase(project, "Design", "2026-11-02", "2026-11-13")
        self.plan.set_dates(phase, {"end": "2026-11-20"})
        self.plan.create_milestone(phase, "Done", "2026-11-20")
        task = self.tasks.create(phase, "Study")
        self.tasks.create(phase, "Sub", task["id"])
        person, _ = PeopleRepository(self.db, clock=self.clock).create("Priya Shah")
        self.tasks.delegate(task["id"], person)
        template = self.templates.create(area, "Plan")
        self.templates.add_item(template["id"], "phase", "Design", 0, 3)
        folder = Path(self.tmp.name) / "Folder"
        folder.mkdir()
        (folder / "a.txt").write_bytes(b"a")
        files = FileRepository(self.db, clock=self.clock)
        files.link_folder(project, str(folder))
        files.attach(files.all()["files"][0]["id"], phase)
        self.notes.delete(project, recursive=True)
        self.notes.delete(area, recursive=True)
        self.notes.delete(person, recursive=True)
        trash = TrashRepository(self.db, clock=self.clock, keep_days=7)
        self.clock.now = "2026-12-01T12:00:00.000Z"
        self.assertGreater(trash.purge(), 0)
        with self.db.reading() as conn:
            for table in ("phases", "milestones", "schedule_changes", "tasks", "plan_templates", "plan_items",
                          "file_folders", "files", "file_links"):
                self.assertEqual(conn.execute("SELECT count(*) FROM " + table).fetchone()[0], 0, table)


if __name__ == "__main__":
    unittest.main()
