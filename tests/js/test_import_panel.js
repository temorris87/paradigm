// The Week Plan's Import panel: when it greys the grid (calendar/import-state.js), its texts,
// Plan without it by day, what an upload says, and the panel itself (calendar/import-panel.js).
import { ImportPanel } from "../../static/js/calendar/import-panel.js";
import { PLAN_WITHOUT_STORE, lastImportedText, meetingCount, quietNote, showsPanel, uploadText } from "../../static/js/calendar/import-state.js";
import { weekDays } from "../../static/js/calendar/week-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const TODAY = "2026-11-27";
const THIS_WEEK = weekDays("2026-11-23");
const NOT_TODAY = { imported_today: false, last_day: "2026-11-25", last_at: "2026-11-25T08:12:00" };

test("import panel: shows on the week holding today while nothing is imported today", () => {
  assertTrue(showsPanel({ days: THIS_WEEK, today: TODAY, status: NOT_TODAY }), "this week, not imported");
  assertTrue(!showsPanel({ days: weekDays("2026-11-30"), today: TODAY, status: NOT_TODAY }), "next week never greys");
  assertTrue(!showsPanel({ days: weekDays("2026-11-16"), today: TODAY, status: NOT_TODAY }), "last week never greys");
  assertTrue(!showsPanel({ days: THIS_WEEK, today: TODAY, status: { ...NOT_TODAY, imported_today: true } }), "imported today");
  assertTrue(!showsPanel({ days: THIS_WEEK, today: TODAY, status: null }), "before the status loads");
});

test("import panel: Plan without it hides it for that day only", () => {
  assertEqual(PLAN_WITHOUT_STORE, "paradigm.planWithout");
  assertTrue(!showsPanel({ days: THIS_WEEK, today: TODAY, status: NOT_TODAY, planWithout: TODAY }), "today: hidden");
  assertTrue(showsPanel({ days: weekDays("2026-11-30"), today: "2026-11-30", status: NOT_TODAY, planWithout: TODAY }),
    "tomorrow it is back");
  assertEqual(quietNote({ status: NOT_TODAY, today: TODAY, planWithout: TODAY }), "Not imported today · i");
  assertEqual(quietNote({ status: NOT_TODAY, today: TODAY, planWithout: null }), "", "the panel says it instead");
  assertEqual(quietNote({ status: NOT_TODAY, today: "2026-11-28", planWithout: TODAY }), "", "a day old: the panel again");
  assertEqual(quietNote({ status: { ...NOT_TODAY, imported_today: true }, today: TODAY, planWithout: TODAY }), "");
});

test("import panel: the Last imported line, or never", () => {
  assertEqual(lastImportedText(NOT_TODAY, TODAY), "Last imported: Wed 25 Nov 08:12 · the tray still works");
  assertEqual(lastImportedText({ imported_today: false, last_day: null, last_at: null }, TODAY), "Never imported yet · the tray still works");
  assertEqual(lastImportedText({ imported_today: false, last_day: "2026-11-25", last_at: null }, TODAY),
    "Last imported: Wed 25 Nov · the tray still works", "no time recorded: the day alone");
});

test("import panel: an upload's status line", () => {
  assertEqual(meetingCount({ new: 2, to_file: 1, updated: 1, skipped: 4, people: 3, files: 1 }), 4, "skipped and people aren't meetings");
  assertEqual(uploadText([{ name: "week.ics", counts: { new: 3, to_file: 1, files: 1 } }]), "Imported 4 meetings from week.ics");
  assertEqual(uploadText([{ name: "one.ics", counts: { new: 1 } }]), "Imported 1 meeting from one.ics");
  assertEqual(uploadText([{ name: "a.ics", counts: { new: 1 } }, { name: "b.ics", counts: { moved: 1 } }]), "Imported 2 meetings from 2 files");
  const bad = new Error("not a calendar file");
  assertEqual(uploadText([{ name: "notes.ics", error: bad }]), "E: not a calendar file: notes.ics");
  assertEqual(uploadText([{ name: "a.ics", counts: { new: 2 } }, { name: "b.ics", error: bad }]),
    "Imported 2 meetings from a.ics. E: not a calendar file: b.ics");
  assertEqual(uploadText([{ name: "big.ics", error: new Error("the calendar file is too large") }]), "E: big.ics: the calendar file is too large");
});

test("import panel: draws its texts and buttons, greys the grid, reports the buttons", () => {
  const cell = document.createElement("div");
  const grid = document.createElement("section");
  cell.append(grid);
  document.body.append(cell);
  const calls = [];
  try {
    const panel = new ImportPanel({ cell, grid, onPick: () => calls.push("pick"), onPlanWithout: () => calls.push("without") });
    assertTrue(!panel.shown, "hidden until drawn");
    panel.draw({ shown: true, lastText: "Never imported yet · the tray still works" });
    assertTrue(panel.shown && grid.inert, "shown, the grid inert");
    const node = cell.querySelector(".import-panel");
    assertEqual(node.querySelector(".import-panel__title").textContent, "Today's calendar isn't imported");
    assertEqual(node.querySelector(".import-panel__steps").textContent,
      "In Outlook: File › Save Calendar › Next 7 days, Full details. Then import that file.");
    assertEqual(node.querySelector(".import-panel__drop").textContent, "Drop the .ics hereor press i to pick it");
    const buttons = [...node.querySelectorAll("button")];
    assertEqual(buttons.map((button) => button.textContent).join("|"), "Import a file… i|Plan without it");
    assertEqual(buttons[0].querySelector(".key")?.textContent, "i", "its key cap");
    assertEqual(node.querySelector(".import-panel__last").textContent, "Never imported yet · the tray still works");
    buttons[0].click();
    buttons[1].click();
    assertEqual(calls.join(), "pick,without");
    panel.focus();
    assertTrue(document.activeElement === buttons[0], "focus: Import a file…");
    panel.draw({ shown: false, lastText: "" });
    assertTrue(!panel.shown && !grid.inert, "gone, the grid live again");
  } finally {
    cell.remove();
  }
});
