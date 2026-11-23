// The on-call rota: reading the Excel sheet, names to people, the week's rota, a person's next
// week, the Week bar's line and the paste's preview.
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { headerDay, parseSheet } from "../../static/js/oncall/sheet.js";
import { Rota, barText, cellPeople, nextOnCall, nextOnCallText, pasteSummary, personForName } from "../../static/js/oncall/oncall-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
const person = (id, title) => ({ id, parent_id: null, title, kind: "person", updated_at: T });
const tree = () => new NoteTree([person(1, "Tom Reyes"), person(2, "Ana Kim"), person(3, "Joe Smith"), person(4, "Joe Park"),
  { id: 9, parent_id: null, title: "Platform", kind: "area", updated_at: T }]);
const TODAY = new Date(2026, 10, 25); // Wed 25 Nov 2026

test("oncall: header dates in every form, numbers month/day, the nearest year", () => {
  const cases = [["11/23", "2026-11-23"], ["11/23/2026", "2026-11-23"], ["11/23/26", "2026-11-23"], ["2026-11-23", "2026-11-23"],
    ["23-Nov", "2026-11-23"], ["Nov 23", "2026-11-23"], ["23 Nov 2026", "2026-11-23"], ["November 23, 2026", "2026-11-23"],
    ["Week of 11/30", "2026-11-30"], ["w/c 7 Dec", "2026-12-07"], ["Mon 11/23", "2026-11-23"], ["1/4", "2027-01-04"],
    ["12/28", "2026-12-28"], ["6/1", "2026-06-01"], ["Role", null], ["13/01", null], ["2/30", null], ["", null]];
  for (const [text, want] of cases) assertEqual(headerDay(text, TODAY), want, text);
  assertEqual(headerDay("1/4", new Date(2026, 0, 10)), "2026-01-04", "early January: this January");
  assertEqual(headerDay("12/28", new Date(2026, 0, 10)), "2025-12-28", "early January: last December");
});

test("oncall: a sheet becomes weeks (each column its date's Monday); bad columns are left out", () => {
  const sheet = "Role\t11/23\t11/27\tNotes\t12/2\r\nPrimary\tTom Reyes\tAna Kim\tx\t\"Smith, Joe\"\r\nSecondary\tAna Kim\t\t\tJoe Smith\r\n\r\nprimary\tdup\tdup\tdup\tdup\r\n";
  const parsed = parseSheet(sheet, TODAY);
  assertEqual(parsed.problem, "");
  assertEqual(parsed.roles.join(), "Primary,Secondary", "a role named twice keeps its first row");
  assertEqual(parsed.skipped.join("|"), "11/27|Notes", "11/27 is the week of 11/23 again; Notes is not a date");
  assertEqual(JSON.stringify(parsed.weeks), JSON.stringify([
    { week: "2026-11-23", roles: [{ role: "Primary", name: "Tom Reyes" }, { role: "Secondary", name: "Ana Kim" }] },
    { week: "2026-11-30", roles: [{ role: "Primary", name: "Smith, Joe" }, { role: "Secondary", name: "Joe Smith" }] }]));
  assertTrue(parseSheet("Role\tNotes\nPrimary\tTom", TODAY).problem.includes("date"));
  assertTrue(parseSheet("Role\t11/23", TODAY).problem.includes("header row"));
  assertTrue(parseSheet("", TODAY).problem.length > 0);
});

test("oncall: names reach people by full name, Last, First, a unique first name; others stay text", () => {
  const notes = tree();
  assertEqual(personForName(notes, "tom  reyes")?.id, 1);
  assertEqual(personForName(notes, "Smith, Joe")?.id, 3);
  assertEqual(personForName(notes, "Ana")?.id, 2);
  assertEqual(personForName(notes, "Joe"), null, "two Joes");
  assertEqual(personForName(notes, "Platform"), null, "an area is not a person");
  const parts = (cell) => cellPeople(notes, cell).map((part) => `${part.text}=${part.person?.id ?? "-"}`).join(" ");
  assertEqual(parts("Tom Reyes / Ana Kim"), "Tom Reyes=1 Ana Kim=2");
  assertEqual(parts("Tom & Pat Lee"), "Tom=1 Pat Lee=-");
  assertEqual(parts("Smith, Joe"), "Smith, Joe=3", "the whole cell first");
  assertEqual(parts("Pat Lee"), "Pat Lee=-");
  assertEqual(parts(""), "");
});

const ROWS = [
  { week: "2026-11-23", role: "Primary", name: "Tom Reyes", position: 0 },
  { week: "2026-11-23", role: "Secondary", name: "Ana Kim", position: 1 },
  { week: "2026-11-23", role: "Manager", name: "Pat Lee", position: 2 },
  { week: "2026-11-30", role: "Secondary", name: "", position: 1 },
  { week: "2026-11-30", role: "Primary", name: "Ana Kim", position: 0 },
  { week: "2026-12-07", role: "Primary", name: "Smith, Joe", position: 0 },
  { week: "2026-11-16", role: "Primary", name: "Joe Smith", position: 0 },
];

test("oncall: the week's rota in the sheet's order, any day of it; the roles of the newest week first", () => {
  const rota = new Rota(ROWS);
  assertEqual(rota.weeks.join(), "2026-11-16,2026-11-23,2026-11-30,2026-12-07");
  assertEqual(rota.of("2026-11-29").map((entry) => `${entry.role}:${entry.name}`).join(), "Primary:Tom Reyes,Secondary:Ana Kim,Manager:Pat Lee");
  assertEqual(rota.of("2026-12-01").map((entry) => entry.role).join(), "Primary", "an empty cell is no one");
  assertEqual(rota.of("2027-01-04").length, 0);
  assertEqual(rota.roles().join(), "Primary,Secondary,Manager");
  assertEqual(rota.name("2026-11-30", "secondary"), "");
});

test("oncall: a person's next week from this week on, in words", () => {
  const rota = new Rota(ROWS);
  const notes = tree();
  const ana = nextOnCall(rota, notes, 2, "2026-11-25");
  assertEqual(`${ana.week} ${ana.roles} ${ana.thisWeek}`, "2026-11-23 Secondary true");
  assertEqual(nextOnCallText(ana, "2026-11-25"), "On call this week (Secondary)");
  const joe = nextOnCall(rota, notes, 3, "2026-11-25");
  assertEqual(`${joe.week} ${joe.thisWeek}`, "2026-12-07 false", "16 Nov has passed");
  assertEqual(nextOnCallText(joe, "2026-11-25"), "On call from Mon 7 Dec (Primary)");
  assertEqual(nextOnCall(rota, notes, 4, "2026-11-25"), null);
  assertEqual(nextOnCallText(null), "");
});

test("oncall: the Week bar names two roles, then +N; the rest in its title", () => {
  const rota = new Rota(ROWS);
  const bar = barText(tree(), rota.of("2026-11-23"));
  assertEqual(bar.text, "On call: Tom Reyes (Primary), Ana Kim (Secondary) +1");
  assertEqual(bar.title, "Tom Reyes (Primary)\nAna Kim (Secondary)\nPat Lee (Manager)");
  assertEqual(barText(tree(), rota.of("2026-12-07")).text, "On call: Joe Smith (Primary)", "named as their note says");
  assertEqual(barText(tree(), []).text, "");
});

test("oncall: the paste's preview: size, span, weeks replaced, unknown names, columns left out", () => {
  const rota = new Rota(ROWS);
  const parsed = parseSheet("Role\t11/30\t12/14\tTBD\nPrimary\tTom\tPat Lee\t\nBackup\tAna / Sam\t\t", TODAY);
  assertEqual(pasteSummary(parsed, rota, tree(), "2026-11-25"),
    "2 roles × 2 weeks, Mon 30 Nov – Mon 14 Dec · replaces 1 week already in · 2 names not in People: Sam, Pat Lee · 1 column left out (not a date or a week twice): TBD");
  assertEqual(pasteSummary(parseSheet("Role\tx\nA\tb", TODAY), rota, tree()), "No week in the header row reads as a date (like 11/23 or 23-Nov)");
});
