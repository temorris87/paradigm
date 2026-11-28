// The on-call rota: reading the Excel sheet, names to people, the week's rota, a person's next
// week, the Week bar's line and the paste's preview.
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { headerDay, parseSheet } from "../../static/js/oncall/sheet.js";
import { Rota, barText, cellPeople, changedTitle, nextOnCall, nextOnCallText, pasteReplaces, pasteSummary, personForName,
  sheetName } from "../../static/js/oncall/oncall-model.js";
import { onCallAction } from "../../static/js/oncall/oncall-keys.js";
import { OnCallPage } from "../../static/js/oncall/oncall-page.js";
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

// 30 Nov's Primary was Ana Kim on the sheet; Tom Reyes stands in.
const CHANGED = [
  ...ROWS.filter((row) => !(row.week === "2026-11-30" && row.role === "Primary")),
  { week: "2026-11-30", role: "Primary", name: "Tom Reyes", sheet_name: "Ana Kim", changed: true, position: 0 },
];

test("oncall: a changed cell shows the new name, says what the sheet had, and reaches the bar, Today and a head", () => {
  const rota = new Rota(CHANGED);
  const cell = rota.cell("2026-11-30", "primary");
  assertEqual(cell.name, "Tom Reyes");
  assertEqual(sheetName(cell), "Ana Kim");
  assertEqual(changedTitle(cell), "was Ana Kim");
  assertEqual(changedTitle(rota.cell("2026-11-23", "Primary")), "", "as the sheet says");
  assertEqual(sheetName(rota.cell("2026-11-23", "Primary")), "Tom Reyes");
  assertEqual(rota.cell("2026-11-30", "Manager"), null, "no Manager that week");
  assertEqual(rota.changed().map((row) => `${row.week} ${row.role}`).join(), "2026-11-30 Primary");
  assertEqual(barText(tree(), rota.of("2026-12-02")).text, "On call: Tom Reyes (Primary)", "the Week bar and Today read of()");
  const ana = nextOnCall(rota, tree(), 2, "2026-12-01");
  assertEqual(ana, null, "Ana no longer holds 30 Nov");
  const tom = nextOnCall(rota, tree(), 1, "2026-12-01");
  assertEqual(`${tom.week} ${tom.roles} ${tom.thisWeek}`, "2026-11-30 Primary true");
});

test("oncall: a paste over a changed cell names it; one that doesn't hold its week says nothing", () => {
  const rota = new Rota(CHANGED);
  const over = parseSheet("Role\t11/30\t12/7\nPrimary\tJoe Park\tTom Reyes", TODAY);
  assertEqual(pasteReplaces(over, rota, "2026-11-25"), "Replaces 1 changed name: Primary 30 Nov (Tom Reyes → Joe Park)");
  const roleGone = parseSheet("Role\t11/30\nSecondary\tJoe Park", TODAY);
  assertEqual(pasteReplaces(roleGone, rota, "2026-11-25"), "Replaces 1 changed name: Primary 30 Nov (Tom Reyes → no one)",
    "the paste replaces the whole week");
  assertEqual(pasteReplaces(parseSheet("Role\t12/7\nPrimary\tAna Kim", TODAY), rota, "2026-11-25"), "");
  assertEqual(pasteReplaces(parseSheet("Role\tx\nA\tb", TODAY), rota, "2026-11-25"), "", "a sheet that doesn't read");
  const many = new Rota(["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21"].map((week, position) =>
    ({ week, role: "Secondary", name: "Farid Haddad", sheet_name: "Hugo Martin", changed: true, position })));
  const all = parseSheet("Role\t11/30\t12/7\t12/14\t12/21\nSecondary\tHugo Martin\tHugo Martin\tHugo Martin\tHugo Martin", TODAY);
  assertEqual(pasteReplaces(all, many, "2026-11-25"), "Replaces 4 changed names: Secondary 30 Nov (Farid Haddad → Hugo Martin), "
    + "Secondary 7 Dec (Farid Haddad → Hugo Martin), Secondary 14 Dec (Farid Haddad → Hugo Martin), …");
  const caughtUp = parseSheet("Role\t11/30\t12/7\nSecondary\tfarid haddad\tHugo Martin", TODAY);
  assertEqual(pasteReplaces(caughtUp, many, "2026-11-25"), "Replaces 1 changed name: Secondary 7 Dec (Farid Haddad → Hugo Martin)",
    "a sheet that now says the stand-in loses nothing, so it isn't named");
});

// 30 Nov's Secondary was empty on the sheet; Farid Haddad was put in by hand.
const FILLED = [
  ...ROWS.filter((row) => !(row.week === "2026-11-30" && row.role === "Secondary")),
  { week: "2026-11-30", role: "Secondary", name: "Farid Haddad", sheet_name: "", changed: true, position: 1 },
];

test("oncall: a cell the sheet left empty and was filled by hand is changed: was no one, named by a paste", () => {
  const rota = new Rota(FILLED);
  const cell = rota.cell("2026-11-30", "Secondary");
  assertEqual(sheetName(cell), "", "the sheet had no one");
  assertEqual(changedTitle(cell), "was no one");
  assertEqual(rota.changed().map((row) => `${row.week} ${row.role}`).join(), "2026-11-30 Secondary");
  const blank = new Rota(ROWS).cell("2026-11-30", "Secondary");
  assertEqual(changedTitle(blank), "", "an empty cell as the sheet says is not changed");
  assertEqual(sheetName(blank), "");
  const over = parseSheet("Role\t11/30\nPrimary\tAna Kim\nSecondary\t", TODAY);
  assertEqual(pasteReplaces(over, rota, "2026-11-25"), "Replaces 1 changed name: Secondary 30 Nov (Farid Haddad → no one)");
});

test("oncall: Enter changes a focused cell; on the link or Change… inside it, Enter is the button's", () => {
  const key = (target) => ({ key: "Enter", target });
  const cell = { matches: (selector) => selector === ".oncall__cell", closest: () => null };
  const inside = { matches: () => false, closest: () => null };
  assertEqual(onCallAction(key(cell)), "change");
  assertEqual(onCallAction(key(inside)), null);
  assertEqual(onCallAction({ key: "]", target: inside }), "nextWeek");
});

test("oncall page: Enter on a cell opens its dialog under it; Esc saves nothing; Save shows the chip, empty puts the sheet back", async () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const press = (target, key) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  let rows = ROWS.map((row) => ({ ...row, sheet_name: "", changed: false }));
  const sent = [];
  const app = { tree: tree(), onCall: new Rota(rows), guard: (promise) => promise, open: async () => {}, say: () => {},
    refreshTree: async () => { app.onCall = new Rota(rows); } };
  const api = { set: async ({ week, role, name }) => {
    sent.push(`${week} ${role} ${name}`);
    rows = rows.map((row) => {
      if (row.week !== week || row.role !== role) return row;
      // As the server: changed marks a changed cell, since a blank sheet cell has sheet_name '' too.
      const sheet = row.changed ? row.sheet_name : row.name;
      return !name || name === sheet ? { ...row, name: sheet, sheet_name: "", changed: false }
        : { ...row, name, sheet_name: sheet, changed: true };
    });
    return rows;
  } };
  const root = document.createElement("div");
  root.tabIndex = -1;
  document.body.append(root);
  try {
    const page = new OnCallPage({ root, api, app: () => app, today: () => TODAY });
    page.show();
    const cellAt = () => root.querySelector('.oncall__cell[data-week="2026-11-30"][data-role="Primary"]');
    assertEqual(cellAt().querySelector(".oncall__change").getAttribute("aria-label"), "Change Primary, week of 30 Nov");
    cellAt().focus();
    press(cellAt(), "Enter");
    let dialog = document.querySelector("dialog.dialog");
    assertEqual(dialog.querySelector(".dialog__title").textContent, "Primary · week of 30 Nov");
    assertEqual(dialog.querySelector(".dialog__text").textContent, "On the sheet: Ana Kim");
    assertTrue(dialog.classList.contains("dialog--anchored"), "opened under the cell");
    press(dialog.querySelector("input"), "Escape");
    await tick();
    assertTrue(!dialog.isConnected, "Esc closes it");
    assertEqual(sent.length, 0, "and saves nothing");

    const change = async (name) => {
      cellAt().querySelector(".oncall__change").click();
      dialog = document.querySelector("dialog.dialog");
      dialog.querySelector("input").value = name;
      dialog.querySelector("form").requestSubmit();
      for (let i = 0; i < 5; i += 1) await tick();
    };
    await change("Tom Reyes");
    assertEqual(cellAt().querySelector(".chip")?.textContent, "changed");
    assertEqual(cellAt().title, "was Ana Kim");
    assertEqual(cellAt().querySelector(".oncall__person").textContent, "Tom Reyes");
    assertEqual(document.activeElement, cellAt(), "the focus is back on the cell");
    // The app redraws the tab again after a save: the focus stays on the (new) cell.
    page.draw();
    assertEqual(document.activeElement, cellAt(), "a second redraw keeps the focus on the cell");
    // ] on a cell moves the week and redraws: the focus stays on the cell, so ] works again.
    page.onMove = (days) => page.setMonday(days > 0 ? "2026-12-07" : "2026-11-30");
    press(cellAt(), "]");
    assertEqual(document.activeElement, cellAt(), "] on a cell keeps the focus on it");
    page.setMonday("2026-11-30");
    cellAt().querySelector(".oncall__change").focus();
    page.draw();
    assertEqual(document.activeElement, cellAt(), "from Change… inside a cell, a redraw lands on the cell");
    await change("Joe Park");
    assertEqual(cellAt().title, "was Ana Kim", "a second change keeps the sheet's name");
    await change("");
    assertEqual(cellAt().querySelector(".chip"), null, "empty puts the sheet's name back");
    assertEqual(cellAt().title, "");
    assertEqual(sent.join("|"), "2026-11-30 Primary Tom Reyes|2026-11-30 Primary Joe Park|2026-11-30 Primary ");

    // A cell the sheet left empty: filled by hand it is changed, and emptied it is no one's again.
    const blankAt = () => root.querySelector('.oncall__cell[data-week="2026-11-30"][data-role="Secondary"]');
    blankAt().querySelector(".oncall__change").click();
    dialog = document.querySelector("dialog.dialog");
    assertEqual(dialog.querySelector(".dialog__text").textContent, "On the sheet: no one");
    dialog.querySelector("input").value = "Farid Haddad";
    dialog.querySelector("form").requestSubmit();
    for (let i = 0; i < 5; i += 1) await tick();
    assertEqual(blankAt().querySelector(".chip")?.textContent, "changed");
    assertEqual(blankAt().title, "was no one");
    blankAt().querySelector(".oncall__change").click();
    dialog = document.querySelector("dialog.dialog");
    assertEqual(dialog.querySelector(".dialog__text").textContent, "On the sheet: no one", "still no one once changed");
    dialog.querySelector("input").value = "";
    dialog.querySelector("form").requestSubmit();
    for (let i = 0; i < 5; i += 1) await tick();
    assertEqual(blankAt().querySelector(".chip"), null, "empty puts the sheet's no one back");
  } finally {
    document.querySelectorAll("dialog.dialog").forEach((node) => node.remove());
    root.remove();
  }
});
