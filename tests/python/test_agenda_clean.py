"""Teams' joining text and mail banners cleaned out of imported agendas (made-up invites)."""
import tempfile
import unittest
from datetime import timedelta, timezone
from pathlib import Path

from calendar_samples import (LONG_RULE, OLD_TEAMS_BLOCK, TEAMS_BLOCK, TEAMS_JOIN, calendar, description,
                              event)
from paradigm.calendar import import_rules as rules
from paradigm.calendar.ics import read_calendar
from paradigm.calendar.teams_boilerplate import is_boilerplate, strip_teams
from paradigm.db.connection import Database
from paradigm.db.import_repo import ImportRepository
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository


def eastern(moment):
    return (moment.astimezone(timezone.utc) - timedelta(hours=5)).replace(tzinfo=None)


def clean(lines):
    return rules.agenda("\n".join(lines))


class AgendaCleanTest(unittest.TestCase):
    def test_current_teams_block_goes_with_its_dial_in_half(self) -> None:
        self.assertEqual(clean(["Agenda for Northwind:", "* budget", ""] + TEAMS_BLOCK),
                         "Agenda for Northwind:\n- budget")

    def test_text_after_the_closing_rule_stays(self) -> None:
        self.assertEqual(clean(["Before"] + TEAMS_BLOCK + ["After the block", "* last point"]),
                         "Before\nAfter the block\n- last point")

    def test_older_format_between_rules_goes(self) -> None:
        self.assertEqual(clean(["Quarterly review"] + OLD_TEAMS_BLOCK + ["Bring numbers"]),
                         "Quarterly review\nBring numbers")

    def test_a_truncated_block_goes_to_the_end(self) -> None:
        truncated = TEAMS_BLOCK[:-1] + ["Stray text Outlook cut off"]
        self.assertEqual(clean(["Above it"] + truncated), "Above it")

    def test_lines_with_no_rules_go_one_by_one(self) -> None:
        forwarded = ["From the organiser:", "Microsoft Teams meeting",
                     "Join on your computer, mobile app or room device",
                     "Click here to join the meeting<" + TEAMS_JOIN + ">", "Review the Acme draft",
                     "Meeting ID: 123 456 789 012", "Passcode: xY7z", "Dial in by phone",
                     "+1 212-555-0199,,987654321# United States, New York", "Phone conference ID: 987 654 321#",
                     "Learn More | Meeting options", "MORE INFO", "Reset dial-in PIN", "Questions to Dana"]
        self.assertEqual(clean(forwarded), "From the organiser:\nReview the Acme draft\nQuestions to Dana")

    def test_a_section_between_rules_without_teams_stays(self) -> None:
        self.assertEqual(clean(["Intro", LONG_RULE, "1. Dates", "2. Owners", LONG_RULE, "Thanks"]),
                         "Intro\n1. Dates\n2. Owners\nThanks")

    def test_banners_go_and_bullets_turn(self) -> None:
        lines = ["** CAUTION: This email came from outside the company. **",
                 "You don't often get email from dana.lee@northwind.example. Learn why this is important<https://aka.ms/x>",
                 "You don’t often get email from someone@northwind.example.",
                 "* first", "  * nested", "See <https://wiki.example/plan>"]
        self.assertEqual(clean(lines), "- first\n  - nested\nSee https://wiki.example/plan")

    def test_mentions_of_teams_stay(self) -> None:
        lines = ["Discuss the Teams rollout", "Microsoft Teams licences for Acme", "More information to follow",
                 "Meeting IDs we use", "Join the meeting now and then"]
        self.assertEqual(clean(lines), "\n".join(lines))

    def test_mentions_of_teams_between_rules_stay(self) -> None:
        channel = "Notes in https://teams.microsoft.com/l/channel/19%3aacme%40thread.tacv2/Plan"
        lines = ["Intro", LONG_RULE, "Microsoft Teams licences for Acme", "1. Dates", LONG_RULE,
                 channel, "2. Owners", LONG_RULE, "Thanks"]
        self.assertEqual(clean(lines), "\n".join(["Intro", "Microsoft Teams licences for Acme", "1. Dates",
                                                  channel, "2. Owners", "Thanks"]))

    def test_boilerplate_after_the_closing_rule_takes_only_its_line(self) -> None:
        self.assertEqual(clean(["Top"] + TEAMS_BLOCK + ["More info", "real agenda"]), "Top\nreal agenda")
        self.assertEqual(clean(["Top"] + TEAMS_BLOCK + ["Meeting ID: 1", "real agenda"]), "Top\nreal agenda")

    def test_a_bare_join_link_marks_the_block(self) -> None:
        lines = ["Agenda", LONG_RULE, TEAMS_JOIN, "Meeting ID: 1 2 3", LONG_RULE, "After"]
        self.assertEqual(clean(lines), "Agenda\nAfter")

    def test_only_a_teams_block_leaves_nothing(self) -> None:
        self.assertEqual(clean(TEAMS_BLOCK), "")
        self.assertEqual(clean(OLD_TEAMS_BLOCK), "")

    def test_the_pieces(self) -> None:
        self.assertTrue(is_boilerplate("Find a local number<https://dialin.example>"))
        self.assertTrue(is_boilerplate("  passcode: abc"))
        self.assertFalse(is_boilerplate("Passcodes are changing"))
        self.assertEqual(strip_teams(["a", LONG_RULE, "b", LONG_RULE, "c"]), ["a", "b", "c"])

    def test_carriage_returns_and_the_cap(self) -> None:
        self.assertEqual(rules.agenda("One\r\n" + "\r\n".join(TEAMS_BLOCK) + "\r\nTwo"), "One\nTwo")
        self.assertEqual(len(rules.agenda("x" * 30000)), rules.MAX_AGENDA_LENGTH)


class ImportedAgendaTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.meetings = MeetingRepository(self.db)
        self.imports = ImportRepository(self.db, today=lambda: "2026-11-23",
                                        to_local=eastern)
        self.hub = self.notes.create(None, "Budget")["id"]
        self.notes.set_kind(self.hub, "project")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def run_import(self, lines):
        extra = ["LOCATION:Microsoft Teams Meeting", description(lines)]
        return self.imports.import_text(calendar([event("t", "Sync", "20261124T100000", "20261124T103000", extra)]))

    def test_the_event_reads_through_ics(self) -> None:
        text = calendar([event("t", "Sync", "20261124T100000", "20261124T103000",
                               [description(["Agenda", "* one"] + TEAMS_BLOCK)])])
        found = read_calendar(text, to_local=eastern).events[0]
        self.assertEqual(rules.agenda(found.description), "Agenda\n- one")

    def test_only_a_block_still_imports_with_its_join_link(self) -> None:
        self.run_import(TEAMS_BLOCK)
        waiting = self.imports.pending()
        self.assertEqual((len(waiting), waiting[0]["agenda"], waiting[0]["join_url"]), (1, "", TEAMS_JOIN))
        meeting = self.imports.file([waiting[0]["id"]], self.hub)[0]
        self.assertEqual((self.meetings.get(meeting)["agenda"], self.meetings.get(meeting)["join_url"]),
                         ("", TEAMS_JOIN))

    def test_reimport_cleans_waiting_ones_and_keeps_made_ones(self) -> None:
        self.run_import(["First draft"])
        self.run_import(["Second draft"] + TEAMS_BLOCK)
        waiting = self.imports.pending()
        self.assertEqual(waiting[0]["agenda"], "Second draft")
        meeting = self.imports.file([waiting[0]["id"]], self.hub)[0]
        self.run_import(["Changed in Outlook"] + TEAMS_BLOCK)
        self.assertEqual(self.meetings.get(meeting)["agenda"], "Second draft")


if __name__ == "__main__":
    unittest.main()
