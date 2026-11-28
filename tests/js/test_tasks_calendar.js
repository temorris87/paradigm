import { calendarAction } from "../../static/js/calendar/calendar-keys.js";
import { calendarBlocks, clock, layoutDay, minutes, shownDays, snap, weekDays, weekOf } from "../../static/js/calendar/week-model.js";
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { boxState, setBox, tasksIn } from "../../static/js/notes/tasks.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { Tasks, hubChoices, openCount, openTasks, subtaskText, taskEntries, tasksOn, todayTasks, waitingOn } from "../../static/js/tasks/tasks-model.js";
import { gridHtml, gridText } from "../../static/js/timesheet/copy.js";
import { forgetPlaced, frameBorder, isWideScreen, isZoomed, noteWindowBox, noteWindowUrl, placeNoteWindow, placeOnFirstLoad } from "../../static/js/windows/note-window.js";
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
  { id: 6, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
];
const task = (id, noteId, title, more = {}) => ({ id, note_id: noteId, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, ...more });
const TASKS = [
  task(10, 2, "Book van"),
  task(11, 2, "Get quotes", { parent_id: 10, done: true, done_day: "2026-11-20" }),
  task(16, 2, "Pick a date", { parent_id: 10 }),
  task(12, 3, "Label boxes"),
  task(13, 4, "Archived one"),
  task(14, 2, "Finished", { done: true, done_day: "2026-11-19" }),
  task(15, 5, "Bring keys"),
  task(17, 2, "Order boxes", { delegate_id: 6, follow_up: "2026-11-20" }),
  task(18, 1, "Area budget"),
];
const tree = () => new NoteTree(NOTES);
const tasks = () => new Tasks(TASKS);

test("checkboxes: boxes in text, their lines, their parents (never in code)", () => {
  const text = "Intro\n- [ ] Draft **budget**\n  - [x] Get [[Q3]] numbers\n- plain\n  - [ ] Under a bullet\n```\n- [ ] code\n```\n> - [ ] quoted";
  assertEqual(tasksIn(text), [
    { field: "body", line: 1, parent: null, title: "Draft budget", done: false },
    { field: "body", line: 2, parent: 1, title: "Get Q3 numbers", done: true },
    { field: "body", line: 4, parent: null, title: "Under a bullet", done: false },
    { field: "body", line: 8, parent: null, title: "quoted", done: false },
  ]);
  assertEqual(boxState("  - [ ] a"), false);
  assertEqual(boxState("1. [X] a"), true);
  assertEqual(boxState("- a"), null);
  assertEqual(setBox("  - [ ] a [ ]", true), "  - [x] a [ ]");
});

test("checkboxes: the preview's boxes carry their line", () => {
  const html = renderMarkdown("x\n\n- [ ] a\n  - [x] b", { taskLines: true });
  assertTrue(html.includes('data-line="2"') && html.includes('data-line="3"') && !html.includes("disabled"), html);
  assertTrue(renderMarkdown("- [ ] a").includes("disabled"));
});

test("tasks: a project's list hides subtasks behind a count; done ones last", () => {
  const onMove = tasksOn(tree(), tasks(), tree().get(2));
  assertEqual(onMove.map((entry) => entry.task.id), [10, 17, 12, 15, 14]);
  assertEqual(subtaskText(onMove[0]), "1/2 subtasks");
  assertEqual(openCount(tree(), tasks(), tree().get(2)), 4);
  // Roll-up: the area lists its own task only, never its project's.
  assertEqual(tasksOn(tree(), tasks(), tree().get(1)).map((entry) => entry.task.id), [18]);
  assertEqual(tasksOn(tree(), tasks(), tree().get(5)).map((entry) => entry.task.id), [15]);
  const section = HUB_SECTIONS.find((each) => each.key === "tasks");
  const ctx = { tree: tree(), tasks: tasks(), sessions: [], today: new Date(2026, 10, 24), expanded: new Set() };
  const rows = section.rows(ctx, tree().get(2));
  assertEqual(rows.length, 5);
  assertEqual(rows[0].detail, "1/2 subtasks");
  assertTrue(rows[1].detail.startsWith("→ Priya Shah") && rows[1].late, rows[1].detail);
  assertEqual(rows[2].detail, "", "closed, a row doesn't say where it is");
  assertEqual(section.rows({ ...ctx, expanded: new Set([12]) }, tree().get(2))[2].detail, "in Packing", "opened, it does");
  assertEqual(rows[4].actions[0].label, "Reopen");
  // Opened, a task shows its subtasks and + Add subtask under it.
  const open = section.rows({ ...ctx, expanded: new Set([10]) }, tree().get(2));
  assertEqual(open.slice(0, 4).map((row) => [row.title, row.depth]), [["Book van", 0], ["Get quotes", 1], ["Pick a date", 1], ["+ Add subtask", 1]]);
});

test("tasks: nested subtasks walk every level; counts read all of them", () => {
  const nested = new Tasks([...TASKS, task(20, 2, "Call movers", { parent_id: 16 }),
    task(21, 2, "Find numbers", { parent_id: 20, done: true, done_day: "2026-11-18" }), task(22, 2, "Ask Jo", { parent_id: 20 })]);
  const entries = taskEntries(tree(), nested).filter((entry) => entry.note.id === 2);
  const order = entries.map((entry) => [entry.task.id, entry.depth]);
  assertEqual(order.slice(0, 6), [[10, 0], [11, 1], [16, 1], [20, 2], [21, 3], [22, 3]]);
  const ask = entries.find((entry) => entry.task.id === 22);
  assertEqual([ask.parent.id, ask.ancestors.map((each) => each.id)], [20, [10, 16, 20]]);
  const book = tasksOn(tree(), nested, tree().get(2))[0];
  assertEqual(subtaskText(book), "2/5 subtasks", "every level, done of all");
  // Opened in place, every level under the task, indented by depth, then + Add subtask.
  const section = HUB_SECTIONS.find((each) => each.key === "tasks");
  const rows = section.rows({ tree: tree(), tasks: nested, sessions: [], today: new Date(2026, 10, 24), expanded: new Set([10]) }, tree().get(2));
  assertEqual(rows.slice(0, 7).map((row) => [row.title, row.depth]), [["Book van", 0], ["Get quotes", 1], ["Pick a date", 1],
    ["Call movers", 2], ["Find numbers", 3], ["Ask Jo", 3], ["+ Add subtask", 1]]);
  assertEqual(rows[0].expanded, true);
  assertEqual(rows[3].expanded, undefined, "only the top row opens in place");
  // The calendar's list: a grandchild of mine shows under its open parents.
  assertTrue(openTasks(tree(), nested).map((entry) => entry.task.id).includes(22));
});

test("tasks: waiting on a person, and the calendar's list", () => {
  assertEqual(waitingOn(tree(), tasks()).map((entry) => entry.task.id), [17]);
  assertEqual(waitingOn(tree(), tasks(), 6).length, 1);
  // Mine only: the delegated task is left out; a task heads its open subtasks.
  assertEqual(openTasks(tree(), tasks()).map((entry) => entry.task.id), [10, 16, 12, 15, 18]);
  assertEqual(openTasks(tree(), tasks(), { text: "label" }).map((entry) => entry.task.id), [12]);
  assertEqual(openTasks(tree(), tasks(), { hubId: 1 }).length, 5);
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
  assertEqual(shownDays(days, [], false, "2026-11-28"), [...days.slice(0, 5), "2026-11-28"], "today shows on a weekend");
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

test("calendar: keys, gt and gc as sequences", () => {
  const key = (k, target = document.body) => calendarAction({ key: k, target, ctrlKey: false, altKey: false, metaKey: false });
  assertEqual([key("["), key("]"), key("t"), key("w"), key("Delete"), key("q")], ["previousWeek", "nextWeek", "today", "weekend", "remove", null]);
  assertEqual([key("i"), key("j"), key("k"), key("s"), key("Enter")], ["import", "next", "previous", "schedule", "menu"]);
  assertEqual([key("g"), key("t")], ["pending", "tray"]);
  assertEqual([key("g"), key("c")], ["pending", "calendar"]);
  assertEqual(key("t", document.createElement("input")), null);
});

test("note window: the right third on a wide screen, the whole screen on a laptop", () => {
  const ultrawide = { availLeft: 0, availTop: 0, availWidth: 3840, availHeight: 1560 };
  const scaled = { availLeft: 0, availTop: 0, availWidth: 2560, availHeight: 1040 };        // 3840x1600 at 150%
  const laptop = { availLeft: 0, availTop: 0, availWidth: 1280, availHeight: 690 };          // 1920x1080 at 150%
  const monitor = { availLeft: 0, availTop: 0, availWidth: 2560, availHeight: 1400 };        // 16:9 QHD
  assertEqual([isWideScreen(ultrawide), isWideScreen(scaled), isWideScreen(laptop), isWideScreen(monitor)], [true, true, false, false]);
  assertEqual(noteWindowBox(ultrawide), { left: 2560, top: 0, width: 1280, height: 1560 });
  assertEqual(noteWindowBox(laptop), { left: 0, top: 0, width: 1280, height: 690 });
  assertEqual(noteWindowBox(laptop, "split").width, 427);
  assertEqual(noteWindowBox(ultrawide, "full").width, 3840);
  assertEqual(noteWindowBox({ ...ultrawide, availLeft: -3840 }).left, -1280);
  assertEqual(noteWindowUrl(5, { field: "agenda", line: 3 }), "/note.html?note=5&line=3&field=agenda");
});

test("note window: the 5120x2160 screen, the invisible border and device pixels", () => {
  const work = { availLeft: 0, availTop: 0, availWidth: 5120, availHeight: 2112 };
  assertEqual(noteWindowBox(work), { left: 3413, top: 0, width: 1707, height: 2112 });
  assertEqual(noteWindowBox(work, "auto", { border: 8 }), { left: 3405, top: 0, width: 1723, height: 2120 });
  // At 125% and 150% every number is a whole CSS px (moveTo/resizeTo drop fractions), the left
  // edge is also a whole device pixel, and the right edge stays exactly on the screen's.
  for (const [ratio, availWidth, availHeight] of [[1.25, 4096, 1690], [1.5, 3413, 1408]]) {
    const scaled = { availLeft: 0, availTop: 0, availWidth, availHeight };
    for (const border of [0, 7, 8]) {
      const box = noteWindowBox(scaled, "auto", { border, ratio });
      assertTrue(Object.values(box).every(Number.isInteger), `whole CSS px at ${ratio}`);
      assertTrue(Number.isInteger(Math.round(box.left * ratio * 1e6) / 1e6), `device px at ${ratio}`);
      assertEqual(box.left + box.width, availWidth + border, `right edge at ${ratio}`);
      assertEqual(box.height, availHeight + border);
    }
  }
  const at125 = { availLeft: 0, availTop: 0, availWidth: 4096, availHeight: 1690 };
  assertEqual(noteWindowBox(at125, "auto", { ratio: 1.25 }), { left: 2732, top: 0, width: 1364, height: 1690 });
  assertEqual(noteWindowBox(at125, "auto", { border: 8, ratio: 1.25 }), { left: 2724, top: 0, width: 1380, height: 1698 });
  // No device pixel within 2 px (a zoomed page's ratio): the nearest whole CSS px.
  assertEqual(noteWindowBox(work, "auto", { ratio: 1.1 }).left, 3413);
  const ultrawide = { availLeft: 0, availTop: 0, availWidth: 3440, availHeight: 1400 };
  assertEqual(noteWindowBox(ultrawide, "auto", { border: 7 }), { left: 2286, top: 0, width: 1161, height: 1407 });
  // A laptop is still the whole screen, and the border doesn't grow it.
  const laptop = { availLeft: 0, availTop: 0, availWidth: 1280, availHeight: 690 };
  assertEqual(noteWindowBox(laptop, "auto", { border: 7, ratio: 1.5 }), { left: 0, top: 0, width: 1280, height: 690 });
  assertEqual(noteWindowBox(work, "full", { border: 8 }), { left: 0, top: 0, width: 5120, height: 2112 });
  assertEqual([frameBorder({ outerWidth: 1723, innerWidth: 1707 }), frameBorder({ outerWidth: 1707, innerWidth: 1707 }),
    frameBorder({ outerWidth: 2400, innerWidth: 1700 }), frameBorder({})], [8, 0, 10, 0]);
  assertEqual(frameBorder({ outerWidth: 1722, innerWidth: 1707 }), 8);
  assertEqual([isZoomed({ outerWidth: 1723, innerWidth: 1707 }), isZoomed({ outerWidth: 1723, innerWidth: 1551 }),
    isZoomed({ outerWidth: 1723, innerWidth: 1900 }), isZoomed({})], [false, true, true, false]);
});

test("note window: zoomed, it doesn't round to a device-pixel grid", () => {
  const moves = [];
  // 125% scaling and 110% zoom: devicePixelRatio 1.375 is no screen grid.
  const win = { outerWidth: 1380, innerWidth: 1240, devicePixelRatio: 1.375,
    screen: { availLeft: 0, availTop: 0, availWidth: 4096, availHeight: 1690 },
    moveTo: (x, y) => moves.push(["move", x, y]), resizeTo: (w, h) => moves.push(["size", w, h]) };
  placeNoteWindow(win, "split");
  assertEqual(moves, [["move", 2731, 0], ["size", 1365, 1690], ["move", 2731, 0]]);
});

test("note window: a window wider than its box still lands on the right third (Chrome clamps)", () => {
  // Like Blink: every rect is clamped to the screen's available area, size first, then place.
  const screen = { availLeft: 0, availTop: 0, availWidth: 800, availHeight: 600 };
  const rect = { x: 0, y: 0, w: 800, h: 600 };
  const clamp = () => {
    rect.w = Math.min(rect.w, screen.availWidth); rect.h = Math.min(rect.h, screen.availHeight);
    rect.x = Math.min(Math.max(rect.x, 0), screen.availWidth - rect.w);
    rect.y = Math.min(Math.max(rect.y, 0), screen.availHeight - rect.h);
  };
  const win = { outerWidth: 800, innerWidth: 800, devicePixelRatio: 1, screen,
    moveTo: (x, y) => { Object.assign(rect, { x, y }); clamp(); },
    resizeTo: (w, h) => { Object.assign(rect, { w, h }); clamp(); } };
  placeNoteWindow(win, "split");
  assertEqual(rect, { x: 533, y: 0, w: 267, h: 600 });
  placeNoteWindow(win, "full");
  assertEqual(rect, { x: 0, y: 0, w: 800, h: 600 });
});

test("note window: placed again on its first load only", () => {
  const stored = new Map();
  const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const moves = [];
  const win = { opener: {}, outerWidth: 1723, innerWidth: 1707, devicePixelRatio: 1,
    screen: { availLeft: 0, availTop: 0, availWidth: 5120, availHeight: 2112 },
    moveTo: (x, y) => moves.push(["move", x, y]), resizeTo: (w, h) => moves.push(["size", w, h]) };
  assertTrue(placeOnFirstLoad(win, { storage, mode: "auto" }));
  // Not grown by the measured 8 px border (Chrome would clamp it back onto the screen), and
  // moved again after the resize, which Chrome clamps too.
  assertEqual(moves, [["move", 3413, 0], ["size", 1707, 2112], ["move", 3413, 0]]);
  assertEqual(placeOnFirstLoad(win, { storage, mode: "auto" }), false);
  assertEqual(placeOnFirstLoad({ ...win, opener: null }, { storage: { getItem: () => null, setItem() {} } }), false);
  assertEqual(moves.length, 3);
  // A main window opened from the note window drops its copy of the mark.
  forgetPlaced({ removeItem: (key) => stored.delete(key) });
  assertTrue(placeOnFirstLoad(win, { storage, mode: "auto" }));
});

test("timesheet: the grid copies as text and HTML", () => {
  const report = { days: ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"],
    rows: [{ code: "A<1", hours: [1.5, 0, 0, 0, 0], total: 1.5 }], totals: [1.5, 0, 0, 0, 0], total: 1.5 };
  assertEqual(gridText(report).split("\n")[0], "Code\tMon 11/23\tTue 11/24\tWed 11/25\tThu 11/26\tFri 11/27\tTotal");
  assertEqual(gridText(report).split("\n")[1], "A<1\t1.50\t\t\t\t\t1.50");
  assertTrue(gridHtml(report).includes("<th>A&lt;1</th>") || gridHtml(report).includes("<td>A&lt;1</td>"));
});

test("the Time page loads its week the first time it is shown", async () => {
  const { TimePage } = await import("../../static/js/timesheet/time-page.js");
  const root = document.createElement("div");
  const bar = document.createElement("div");
  const main = document.createElement("div");
  root.append(bar, main);
  let asked = null;
  const api = { week: async (monday) => {
    asked = monday;
    return { days: ["2026-11-23"], rows: [{ code: "A-1", hours: [8], total: 8 }], totals: [8], total: 8, default_code: "A-1",
      unbooked_hours: 0, warnings: [], pto: [], not_counted: [], details: {} };
  } };
  const page = new TimePage({ root, bar, main, api, changes: { listen() {} }, today: () => new Date(2026, 10, 25) });
  page.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEqual(asked, "2026-11-23");
  assertEqual(main.querySelector(".time-week").hidden, false);
  assertTrue(main.querySelector(".time-grid"), "the grid is drawn");
});
