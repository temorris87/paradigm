// Today as in Figma: the free time left in the day column's head (today-model.js freeLeft),
// the Import panel over the day (showsPanel with today the only day, "Not today", i, a drop),
// and the upload Today runs (today-actions.js), on generated sample data.
import { ImportPanel } from "../../static/js/calendar/import-panel.js";
import { PLAN_WITHOUT_STORE, showsPanel } from "../../static/js/calendar/import-state.js";
import { ONLY_CALENDAR_FILES, calendarFiles, planWithoutDay, setPlanWithout, uploadCalendarFiles } from "../../static/js/calendar/import-upload.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { todayActions } from "../../static/js/today/today-actions.js";
import { TODAY_KEYS } from "../../static/js/today/today-keys.js";
import { dayTimeline, freeLeft, freeLeftText, restIsFree } from "../../static/js/today/today-model.js";
import { TodayPage } from "../../static/js/today/today-page.js";
import { hintsOf } from "../../static/js/ui/key-hints.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
// Monday 23 November 2026.
const at = (hour, minute = 0) => new Date(2026, 10, 23, hour, minute);
const NOTES = [
  { id: 1, parent_id: null, title: "Northwind", kind: "project", status: "active", updated_at: T },
  { id: 5, parent_id: 1, title: "Design review", kind: "meeting", updated_at: T },
];
const TASKS = [{ id: 10, note_id: 1, parent_id: null, title: "Draft plan", notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: 1, snoozed_until: "" }];
// 09:30–11:00 a block, 11:00–12:00 a meeting, 15:00–16:30 a block; working 08–17, lunch 12–13.
const SESSIONS = [{ id: 1, task_id: 10, day: "2026-11-23", start: "09:30", end: "11:00" },
  { id: 2, task_id: 10, day: "2026-11-23", start: "15:00", end: "16:30" }];
const MEETINGS = [{ id: 5, day: "2026-11-23", time: "11:00", end_time: "12:00", cancelled: false, attendees: [] }];
const SETTINGS = { settings: { day_start: "08:00", day_end: "17:00", lunch_start: "12:00", lunch_end: "13:00" }, upcoming: [] };
const NOT_IMPORTED = { imported_today: false, last_day: "2026-11-20", last_at: "2026-11-20T08:12:00" };
const IMPORTED = { imported_today: true, last_day: "2026-11-23", last_at: "2026-11-23T08:00:00" };
const ctx = (more = {}) => ({ tree: new NoteTree(NOTES), tasks: new Tasks(TASKS), sessions: SESSIONS, meetings: new Meetings(MEETINGS),
  timeSettings: SETTINGS, ...more });
const headAt = (now, more) => freeLeftText(freeLeft(ctx(more), now));

test("today free left: the head says what is left from now, falling as the clock passes a gap", () => {
  assertEqual(headAt(at(10)), "2.5 h free left today · 1 h meetings · 3 h focus", "13–15 and 16:30–17");
  assertEqual(headAt(at(8)), "4 h free left today · 1 h meetings · 3 h focus", "before the day: 08–09:30 too");
  assertEqual(headAt(at(14)), "1.5 h free left today · 1 h meetings · 3 h focus", "half the 13–15 gap gone");
  assertEqual(headAt(at(16, 45)), "15 min free left today · 1 h meetings · 3 h focus");
  assertEqual(headAt(at(17)), "Working day over");
  assertEqual(headAt(at(20)), "Working day over");
  const full = [...SESSIONS, { id: 3, task_id: 10, day: "2026-11-23", start: "16:30", end: "17:00" }];
  assertEqual(headAt(at(16), { sessions: full }), "No free time left today");
  assertEqual(freeLeftText(freeLeft(ctx(), new Date(2026, 10, 28, 10, 0))), "Day off", "a Saturday");
  const holiday = { ...SETTINGS, upcoming: [{ day: "2026-11-23", name: "Founders' day" }] };
  assertEqual(headAt(at(10), { timeSettings: holiday }), "Day off", "a holiday");
  assertEqual(freeLeftText({ state: "left", freeMin: 90, meetingMin: 0, focusMin: 0 }), "1.5 h free left today", "nothing else: no 0 parts");
});

test("today free left: the Now card's headline once nothing more is on", () => {
  assertTrue(!restIsFree(ctx(), at(10)), "a meeting still to come");
  assertTrue(restIsFree(ctx(), at(13)), "the meeting is over and free time is left");
  assertTrue(!restIsFree(ctx(), at(17, 30)), "the working day is over");
});

test("today import: events still to file show on the day, muted, and open the Week", () => {
  // A first import: new series wait in To file (GET /api/calendar/pending), with no meeting note.
  const pending = [{ id: 7, day: "2026-11-23", time: "14:00", end_time: "14:30", title: "Acme standup" },
    { id: 8, day: "2026-11-24", time: "10:00", end_time: "", title: "Tomorrow's" }];
  const rows = dayTimeline(ctx({ pending }), at(10)).rows.filter((row) => row.kind === "pending");
  assertEqual(rows.map((row) => `${row.time} ${row.title} · ${row.detail}`).join(" | "), "14:00 Acme standup · to file on the Week (g w)", "today's only");
  assertTrue(rows[0].muted && rows[0].id === null, "muted, no note");
  assertTrue(!restIsFree(ctx({ pending }), at(13)), "an event to file is still to come");
  // Not yet filed, but still busy: the head and the free gaps leave it out, as a meeting.
  assertEqual(headAt(at(10), { pending }), "2 h free left today · 1.5 h meetings · 3 h focus", "14:00–14:30 is busy");
  const gaps = dayTimeline(ctx({ pending }), at(10)).rows.filter((row) => row.kind === "free").map((row) => `${row.time} ${row.title}`);
  assertEqual(gaps.join(" | "), "13:00 1 h free | 14:30 30 min free | 16:30 30 min free", "no gap row over the event");
  let opened = 0;
  const section = document.createElement("section");
  const page = new TodayPage(section, { onOpen() {}, onLeave() {}, today: () => at(10), storage: { getItem: () => null, setItem() {} },
    actions: { toFile: () => { opened += 1; } } });
  page.show({ ...ctx({ pending }), importStatus: IMPORTED });
  const row = [...section.querySelectorAll(".today-day__row--pending")];
  assertEqual(row.length, 1, "drawn");
  row[0].click();
  assertEqual(opened, 1, "Enter or a click opens the Week's To file");
});

test("today import: showsPanel with today the only day", () => {
  const day = "2026-11-23";
  assertTrue(showsPanel({ days: [day], today: day, status: NOT_IMPORTED }), "not imported");
  assertTrue(!showsPanel({ days: [day], today: day, status: IMPORTED }), "imported today");
  assertTrue(!showsPanel({ days: [day], today: day, status: null }), "status not loaded");
  assertTrue(!showsPanel({ days: [day], today: day, status: NOT_IMPORTED, planWithout: day }), "Not today chosen today");
  assertTrue(showsPanel({ days: [day], today: day, status: NOT_IMPORTED, planWithout: "2026-11-22" }), "chosen yesterday: back");
});

test("today import: the panel's second button is the page's; the Week keeps Plan without it", () => {
  const labels = (options) => {
    const cell = document.createElement("div");
    new ImportPanel({ cell, grid: cell, onPick() {}, onPlanWithout() {}, ...options });
    return [...cell.querySelectorAll("button")].map((button) => button.textContent).join("|");
  };
  assertEqual(labels({ withoutLabel: "Not today" }), "Import a file… i|Not today");
  assertEqual(labels({}), "Import a file… i|Plan without it");
});

test("today import: i in the table, with no hint", () => {
  const entry = TODAY_KEYS.find((each) => each.action === "import");
  assertEqual(entry?.keys.join(), "i");
  assertEqual(entry.help, "import today's calendar (.ics)");
  assertTrue(!hintsOf(TODAY_KEYS).some(({ cap }) => cap === "i"), "the panel shows its key");
});

test("today import: the shared upload code and the stored day", async () => {
  const ics = new File(["BEGIN:VCALENDAR"], "week.ics");
  const text = new File(["x"], "notes.txt", { type: "text/plain" });
  assertEqual(calendarFiles([ics, text]).map((file) => file.name).join(), "week.ics");
  assertEqual(await uploadCalendarFiles(async () => ({ new: 1 }), [text]), null, "no calendar file");
  const results = await uploadCalendarFiles(async (file) => {
    if (file.name === "bad.ics") throw new Error("not a calendar file");
    return { new: 2 };
  }, [ics, new File(["x"], "bad.ics")]);
  assertEqual(results.map((each) => `${each.name}:${each.error ? "error" : each.counts.new}`).join(), "week.ics:2,bad.ics:error");
  const stored = {};
  const storage = { getItem: (name) => stored[name] ?? null, setItem: (name, value) => { stored[name] = value; } };
  assertEqual(planWithoutDay(storage), null);
  setPlanWithout(storage, "2026-11-23");
  assertEqual(stored[PLAN_WITHOUT_STORE], "2026-11-23");
  const refusing = { getItem() { throw new Error("off"); }, setItem() { throw new Error("off"); } };
  setPlanWithout(refusing, "2026-11-23");
  assertEqual(planWithoutDay(refusing), null, "storage refused: no throw");
});

/** A Today page on sample data, 10:00 Monday, nothing imported today. */
function todayPage({ status = NOT_IMPORTED, stored = {} } = {}) {
  const section = document.createElement("section");
  document.body.append(section);
  const calls = [];
  const storage = { getItem: (name) => stored[name] ?? null, setItem: (name, value) => { stored[name] = String(value); } };
  const page = new TodayPage(section, { onOpen: (id) => calls.push(`open ${id}`), onLeave() {}, today: () => at(10), storage,
    actions: { importCalendar: (files) => calls.push(`import ${[...files].map((file) => file.name).join("+")}`),
      done: (id, done) => calls.push(`done ${id} ${done}`) } });
  page.show(ctx({ importStatus: status }));
  return { page, section, calls, stored };
}

test("today import: the panel greys the day, its rows leave the listbox; the rest stays live", () => {
  const { page, section, calls } = todayPage();
  try {
    const panel = section.querySelector(".today-daycell > .import-panel");
    const day = section.querySelector(".today-daycell > .today-day");
    assertTrue(panel && !panel.hidden, "the panel shows over the day");
    assertTrue(day.inert, "the day takes no clicks");
    assertEqual(day.querySelectorAll("[role=option]").length, 0, "no day row is an option");
    assertEqual([...panel.querySelectorAll("button")].map((button) => button.textContent).join("|"), "Import a file… i|Not today");
    assertEqual(panel.querySelector(".import-panel__title").textContent, "Today's calendar isn't imported");
    assertEqual(panel.querySelector(".import-panel__last").textContent, "Last imported: Fri 20 Nov 08:12 · the tray still works");
    assertTrue(!section.querySelector(".today-import"), "no import chip");
    assertEqual(section.querySelector(".today-day .today__detail").textContent, "2.5 h free left today · 1 h meetings · 3 h focus");
    section.querySelector(".today-now__button--done").click();
    assertEqual(calls.pop(), "done 10 true", "the Now card still works");
  } finally {
    section.remove();
  }
  assertTrue(page.panel.shown);
});

test("today import: i and Import a file… open the picker; a drop of files imports them", () => {
  const { page, section, calls } = todayPage();
  try {
    let picked = 0;
    page.picker.click = () => { picked += 1; };
    page.list.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true, cancelable: true }));
    section.querySelector(".import-panel__button--primary").click();
    assertEqual(picked, 2);
    assertEqual(page.picker.accept, ".ics");
    assertTrue(page.picker.multiple, "several files");
    const data = new DataTransfer();
    data.items.add(new File(["BEGIN:VCALENDAR"], "week.ics"));
    const drop = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
    section.querySelector(".today-now").dispatchEvent(drop);
    assertTrue(drop.defaultPrevented, "the browser doesn't open the file");
    assertEqual(calls.pop(), "import week.ics");
  } finally {
    section.remove();
  }
});

test("today import: Not today stores the day and hides the panel; imported, no panel", () => {
  const { page, section, stored } = todayPage();
  try {
    [...section.querySelectorAll(".import-panel button")].find((button) => button.textContent === "Not today").click();
    assertEqual(stored[PLAN_WITHOUT_STORE], "2026-11-23");
    assertTrue(!page.panel.shown, "gone");
    const day = section.querySelector(".today-daycell > .today-day");
    assertTrue(!day.inert && day.querySelectorAll("[role=option]").length > 0, "the day is live again");
    assertTrue(document.activeElement === page.list, "the focus on the page");
  } finally {
    section.remove();
  }
  const again = todayPage({ stored: { [PLAN_WITHOUT_STORE]: "2026-11-23" } });
  assertTrue(!again.page.panel.shown, "the Week's Plan without it hides it too");
  again.section.remove();
  const yesterday = todayPage({ stored: { [PLAN_WITHOUT_STORE]: "2026-11-22" } });
  assertTrue(yesterday.page.panel.shown, "chosen yesterday: back");
  yesterday.section.remove();
  const imported = todayPage({ status: IMPORTED });
  assertTrue(!imported.page.panel.shown && !imported.section.querySelector(".today-import"), "imported: no panel, no chip");
  imported.section.remove();
});

test("today import: the upload says what came in and reads everything again; a bad file says E:", async () => {
  const said = [];
  const sent = [];
  let refreshed = 0;
  const app = {
    guard: (promise) => promise,
    say: (text, options = {}) => said.push(`${options.error ? "!" : ""}${text}`),
    refreshTree: async () => { refreshed += 1; },
    changes: { send: (message) => sent.push(message.what.join()) },
    calendarApi: { upload: async (file) => {
      if (file.name === "notes.ics") throw new Error("not a calendar file");
      return { new: 3, to_file: 1 };
    } },
  };
  const actions = todayActions(app);
  await actions.importCalendar([new File(["x"], "week.ics")]);
  assertEqual(said.pop(), "Imported 4 meetings from week.ics");
  assertEqual([refreshed, sent.join()].join(), "1,meetings");
  await actions.importCalendar([new File(["x"], "notes.ics")]);
  assertEqual(said.pop(), "!E: not a calendar file: notes.ics");
  assertEqual(refreshed, 1, "nothing came in: nothing to read again, the panel stays");
  await actions.importCalendar([new File(["x"], "notes.txt", { type: "text/plain" })]);
  assertEqual(said.pop(), ONLY_CALENDAR_FILES);
});
