import { calendarAction } from "../../static/js/calendar/calendar-keys.js";
import { importSummary } from "../../static/js/calendar/calendar-page.js";
import { calendarBlocks, clock, layoutDay, minutes, shownDays, snap, weekDays, weekOf } from "../../static/js/calendar/week-model.js";
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { indexTexts } from "../../static/js/notes/link-index.js";
import { boxState, setBox, tasksIn, withTaskAdded } from "../../static/js/notes/tasks.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { Tasks, hubChoices, openTasks, tasksOn, todayTasks } from "../../static/js/tasks/tasks-model.js";
import { gridHtml, gridText } from "../../static/js/timesheet/copy.js";
import { homeSections } from "../../static/js/home/home-sections.js";
import { popOutBox } from "../../static/js/windows/popout.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

// Values compared as JSON: arrays and objects by what they hold.
const assertEqual = (actual, expected) => same(JSON.stringify(actual), JSON.stringify(expected));

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Ops", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Move", kind: "project", area_id: 1, updated_at: T },
  { id: 3, parent_id: 2, title: "Packing", updated_at: T },
  { id: 4, parent_id: null, title: "Old", kind: "project", archived_at: T, updated_at: T },
  { id: 5, parent_id: 2, title: "Sync", kind: "meeting", updated_at: T },
];
const TASKS = [
  { id: 10, note_id: 2, field: "body", line: 0, parent_id: null, title: "Book van", done: false, done_day: "" },
  { id: 11, note_id: 2, field: "body", line: 1, parent_id: 10, title: "Get quotes", done: true, done_day: "2026-11-20" },
  { id: 12, note_id: 3, field: "body", line: 4, parent_id: null, title: "Label boxes", done: false, done_day: "" },
  { id: 13, note_id: 4, field: "body", line: 0, parent_id: null, title: "Archived one", done: false, done_day: "" },
  { id: 14, note_id: 2, field: "body", line: 5, parent_id: null, title: "Finished", done: true, done_day: "2026-11-19" },
  { id: 15, note_id: 5, field: "agenda", line: 0, parent_id: null, title: "Bring keys", done: false, done_day: "" },
];
const tree = () => new NoteTree(NOTES);
const tasks = () => new Tasks(TASKS);

test("tasks: boxes, their lines, their parents (never in code)", () => {
  const text = "Intro\n- [ ] Draft **budget**\n  - [x] Get [[Q3]] numbers\n- plain\n  - [ ] Under a bullet\n```\n- [ ] code\n```\n> - [ ] quoted";
  assertEqual(tasksIn(text), [
    { field: "body", line: 1, parent: null, title: "Draft budget", done: false },
    { field: "body", line: 2, parent: 1, title: "Get Q3 numbers", done: true },
    { field: "body", line: 4, parent: null, title: "Under a bullet", done: false },
    { field: "body", line: 8, parent: null, title: "quoted", done: false },
  ]);
  assertEqual(indexTexts({ body: "- [ ] a", agenda: "- [x] b" }).tasks.map((task) => [task.field, task.done]),
    [["body", false], ["agenda", true]]);
});

test("tasks: ticking a line, adding one", () => {
  assertEqual(boxState("  - [ ] a"), false);
  assertEqual(boxState("1. [X] a"), true);
  assertEqual(boxState("- a"), null);
  assertEqual(setBox("  - [ ] a [ ]", true), "  - [x] a [ ]");
  assertEqual(withTaskAdded("Notes", "Call  Jo"), "Notes\n- [ ] Call Jo");
  assertEqual(withTaskAdded("", "Call"), "- [ ] Call");
  assertEqual(withTaskAdded("a\n", "Call"), "a\n- [ ] Call");
});

test("tasks: the preview's boxes carry their line", () => {
  const html = renderMarkdown("x\n\n- [ ] a\n  - [x] b", { taskLines: true });
  assertTrue(html.includes('data-line="2"') && html.includes('data-line="3"') && !html.includes("disabled"), html);
  assertTrue(renderMarkdown("- [ ] a").includes("disabled"));
});

test("tasks: a hub's, an area's with its projects', a meeting's", () => {
  const onMove = tasksOn(tree(), tasks(), tree().get(2)).map((entry) => [entry.task.id, entry.depth]);
  // Open first with the done subtask kept under its open parent; done ones last.
  assertEqual(onMove, [[10, 0], [11, 1], [12, 0], [15, 0], [14, 0]]);
  assertEqual(tasksOn(tree(), tasks(), tree().get(1)).length, 5);
  assertEqual(tasksOn(tree(), tasks(), tree().get(5)).map((entry) => entry.task.id), [15]);
  const rows = HUB_SECTIONS.find((section) => section.key === "tasks").rows({ tree: tree(), tasks: tasks(), sessions: [] }, tree().get(2));
  assertEqual(rows[2].detail, "Packing");
  assertEqual(rows[0].at, { field: "body", line: 0 });
  assertEqual(rows[4].actions[0].label, "Reopen");
});

test("tasks: the calendar's list and its filter", () => {
  assertEqual(openTasks(tree(), tasks()).map((entry) => entry.task.id), [10, 12, 15]);
  assertEqual(openTasks(tree(), tasks(), { text: "label" }).map((entry) => entry.task.id), [12]);
  assertEqual(openTasks(tree(), tasks(), { hubId: 1 }).length, 3);
  assertEqual(hubChoices(tree(), tasks()).map((hub) => hub.title), ["Move", "Ops"]);
  const today = todayTasks(tree(), tasks(), [{ id: 1, task_id: 12, day: "2026-11-23", start: "13:00", end: "14:00" },
    { id: 2, task_id: 10, day: "2026-11-23", start: "09:00", end: "10:00" }, { id: 3, task_id: 10, day: "2026-11-24", start: "09:00", end: "10:00" }], "2026-11-23");
  assertEqual(today.map(({ session }) => session.id), [2, 1]);
});

test("week: days, the weekend shows only when used", () => {
  assertEqual(weekOf("2026-11-26"), "2026-11-23");
  assertEqual(weekOf("2026-11-29"), "2026-11-23");
  const days = weekDays("2026-11-23");
  assertEqual(days[6], "2026-11-29");
  assertEqual(shownDays(days, []).length, 5);
  assertEqual(shownDays(days, [{ day: "2026-11-29" }]), [...days.slice(0, 5), "2026-11-29"]);
  assertEqual(shownDays(days, [], true).length, 7);
  assertEqual([minutes("09:30"), clock(570), clock(1440), snap(37), snap(38)], [570, "09:30", "24:00", 30, 45]);
});

test("week: blocks from meetings, task sessions and waiting imports", () => {
  const meetings = new Meetings([{ id: 5, day: "2026-11-24", time: "10:00", end_time: "", cancelled: true, location: "Room 4", attendees: [] }]);
  const blocks = calendarBlocks({ tree: tree(), meetings, tasks: tasks(), sessions: [{ id: 7, task_id: 12, day: "2026-11-25", start: "13:00", end: "14:30" }],
    pending: [{ id: 3, day: "2026-11-26", time: "", end_time: "", title: "Offsite" }] }, weekDays("2026-11-23"));
  const byKind = Object.fromEntries(blocks.map((block) => [block.kind, block]));
  assertEqual([byKind.meeting.start, byKind.meeting.end, byKind.meeting.cancelled, byKind.meeting.sub], [600, 630, true, "Move · Room 4"]);
  assertEqual([byKind.task.start, byKind.task.end, byKind.task.noteId, byKind.task.sub], [780, 870, 3, "Move · Packing"]);
  assertEqual([byKind.pending.timed, byKind.pending.muted], [false, true]);
});

test("week: overlapping blocks share the width", () => {
  const block = (key, start, end) => ({ key, start, end, timed: true });
  const placed = layoutDay([block("a", 540, 600), block("b", 570, 630), block("c", 600, 660), block("d", 700, 720)]);
  const at = Object.fromEntries(placed.map((each) => [each.key, [each.col, each.cols]]));
  assertEqual(at, { a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
});

test("calendar: keys and the import summary", () => {
  const key = (k, target = document.body) => calendarAction({ key: k, target, ctrlKey: false, altKey: false, metaKey: false });
  assertEqual([key("["), key("]"), key("t"), key("w"), key("Delete"), key("q")], ["previousWeek", "nextWeek", "today", "weekend", "remove", null]);
  assertEqual(key("t", document.createElement("input")), null);
  assertEqual(importSummary({ files: 1, new: 2, to_file: 1, errors: [] }), "Imported 1 file: 2 new, 1 to file.");
  assertTrue(importSummary({ files: 0, errors: [] }).startsWith("No calendar file"));
});

test("pop-out: the left two thirds, full height", () => {
  assertEqual(popOutBox({ availLeft: 0, availTop: 0, availWidth: 3840, availHeight: 1560 }), { left: 0, top: 0, width: 2560, height: 1560 });
});

test("timesheet: the grid copies as text and HTML", () => {
  const report = { days: ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"],
    rows: [{ code: "A<1", hours: [1.5, 0, 0, 0, 0], total: 1.5 }], totals: [1.5, 0, 0, 0, 0], total: 1.5 };
  assertEqual(gridText(report).split("\n")[0], "Code\tMon 11/23\tTue 11/24\tWed 11/25\tThu 11/26\tFri 11/27\tTotal");
  assertEqual(gridText(report).split("\n")[1], "A<1\t1.50\t\t\t\t\t1.50");
  assertTrue(gridHtml(report).includes("<th>A&lt;1</th>") || gridHtml(report).includes("<td>A&lt;1</td>"));
});

test("home: Today holds the day's task blocks by time, and the import reminder", () => {
  const meetings = new Meetings([{ id: 5, day: "2026-11-24", time: "10:00", end_time: "11:00", cancelled: false, attendees: [] }]);
  const sessions = [{ id: 1, task_id: 12, day: "2026-11-24", start: "09:00", end: "09:30" }, { id: 2, task_id: 10, day: "2026-11-24", start: "13:00", end: "14:00" }];
  const ctx = { tree: tree(), meetings, records: { all: () => [], get: () => ({}) }, tasks: tasks(), sessions,
    importStatus: { imported_today: false, waiting: 1 } };
  const today = homeSections(ctx, new Date(2026, 10, 24))[0];
  assertEqual(today.rows.map((row) => row.cells.map(([, text]) => text)[1] ?? row.cells[0][1]),
    ["Calendar not imported today (1 file waiting: open the calendar to import)", "☐ Label boxes", "Sync", "☐ Book van"]);
  assertEqual(today.rows[2].cells[0][1], "10:00–11:00");
});
