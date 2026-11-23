// Today: the Now block, the day's timeline with free gaps, the ranked Up next, project status,
// capacity and the first free slot, and the page's keys.
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { prepFor, prepText } from "../../static/js/meetings/prep-model.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Records } from "../../static/js/records/records-model.js";
import { StatusLogs } from "../../static/js/status/status-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { TODAY_KEYS, todayHints } from "../../static/js/today/today-keys.js";
import { dayTimeline, nowBlock, projectRows, upNext } from "../../static/js/today/today-model.js";
import { TodayPage } from "../../static/js/today/today-page.js";
import { dayCapacity, firstFreeSlot, hoursText, workingSpans } from "../../static/js/week/capacity.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
// Monday 23 November 2026, 10:00.
const NOW = new Date(2026, 10, 23, 10, 0);
const NOTES = [
  { id: 1, parent_id: null, title: "Event bus", kind: "project", status: "active", updated_at: T },
  { id: 2, parent_id: null, title: "Gateway", kind: "project", status: "active", updated_at: T },
  { id: 3, parent_id: null, title: "Cache", kind: "project", status: "on_hold", updated_at: T },
  { id: 4, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
  { id: 5, parent_id: 1, title: "Architecture review", kind: "meeting", updated_at: T },
  { id: 6, parent_id: 1, title: "Exactly-once?", kind: "question", updated_at: T },
  { id: 7, parent_id: 2, title: "Owner?", kind: "question", updated_at: T },
  { id: 8, parent_id: null, title: "Auth", kind: "project", status: "active", updated_at: T },
];
const task = (id, noteId, title, more = {}) => ({ id, note_id: noteId, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, is_next: false, snoozed_until: "", ...more });
const TASKS = [
  task(10, 1, "Draft ADR", { due: "2026-11-20" }),
  task(11, 1, "Load-test numbers", { delegate_id: 4, follow_up: "2026-11-19" }),
  task(12, 2, "Rate-limit review", { due: "2026-11-23" }),
  task(13, 1, "Retry semantics", { due: "2026-11-25" }),
  task(14, 8, "Pick token store"),
  task(15, 3, "Cache thing", { due: "2026-11-20" }),
  task(16, 2, "Snoozed", { due: "2026-11-20", snoozed_until: "2026-11-24" }),
  task(17, 1, "Done one", { due: "2026-11-20", done: true }),
  task(18, 2, "Sunset plan", { due: "2026-12-20" }),
];
const SESSIONS = [{ id: 1, task_id: 10, day: "2026-11-23", start: "09:30", end: "11:00" },
  { id: 2, task_id: 12, day: "2026-11-23", start: "15:00", end: "16:30" }];
const MEETINGS = [{ id: 5, day: "2026-11-23", time: "11:00", end_time: "12:00", cancelled: false, attendees: [4] }];
const RECORDS = [{ id: 6, kind: "question", day: "2026-11-02", people: [4], answered: "" },
  { id: 7, kind: "question", day: "2026-11-20", people: [], answered: "" }];
const SETTINGS = { settings: { day_start: "08:00", day_end: "17:00", lunch_start: "12:00", lunch_end: "13:00" }, upcoming: [] };
const ctx = (more = {}) => ({ tree: new NoteTree(NOTES), tasks: new Tasks(TASKS), sessions: SESSIONS, meetings: new Meetings(MEETINGS),
  records: new Records(RECORDS), timeSettings: SETTINGS, statusLogs: new StatusLogs([
    { id: 1, note_id: 1, day: "2026-11-20", health: "at_risk", text: "Design slipped. ADR waits.", created_at: T },
    { id: 2, note_id: 2, day: "2026-11-01", health: "on_track", text: "Fine.", created_at: T }]), ...more });

test("today: Up next ranks overdue, follow-ups, due today, due soon, next actions, old questions", () => {
  const items = upNext(ctx(), NOW);
  assertEqual(items.map((item) => `${item.reason}:${item.title}`).join(" | "),
    "Overdue 3 d:Draft ADR | Follow up 4 d:Load-test numbers | Due today:Rate-limit review | Due WED:Retry semantics"
    + " | Next action:Pick token store | Asked 21 d:Exactly-once?");
  assertEqual(items[0].place, "in calendar".replace("in calendar", "09:30"), "a block today shows its time");
  assertEqual(items[1].glyph + items[1].place, "→nudge");
  assertEqual(items[3].place, "s schedule");
  assertEqual(items[5].glyph + items[5].place, "?answer");
  assertTrue(!items.some((item) => ["Cache thing", "Snoozed", "Done one", "Sunset plan"].includes(item.title)),
    "on hold, snoozed, done and far-off tasks stay out");
});

test("today: the Now block, else the next one", () => {
  const block = nowBlock(ctx(), NOW);
  assertEqual([block.entry.task.title, block.elapsed, block.left, block.next].join(), "Draft ADR,30,60,false");
  const later = nowBlock(ctx(), new Date(2026, 10, 23, 13, 0));
  assertEqual([later.entry.task.title, later.next].join(), "Rate-limit review,true");
  assertEqual(nowBlock(ctx(), new Date(2026, 10, 23, 17, 0)), null);
});

test("today: the day's timeline: blocks, meetings with prep, free gaps, a Log status reminder", () => {
  const { capacity, rows } = dayTimeline(ctx(), NOW);
  assertEqual(rows.map((row) => `${row.time} ${row.kind} ${row.title}${row.current ? " *" : ""}${row.past ? " (past)" : ""}`).join(" | "),
    "09:30 task Draft ADR * | 11:00 meeting Architecture review | 13:00 free 2 h free | 15:00 task Rate-limit review"
    + " | 16:30 free 30 min free | 16:30 suggest Log status");
  assertEqual(rows[1].detail, "prep: 1 question, 1 follow-up");
  assertEqual([capacity.workMin, capacity.meetingMin, capacity.focusMin, capacity.freeMin].join(), "480,60,180,240");
});

test("today: projects with their latest status; on hold last; stale and never logged", () => {
  const rows = projectRows(ctx(), NOW);
  assertEqual(rows.map((row) => `${row.title}:${row.health}:${row.stale ? "stale" : ""}`).join(),
    "Auth:none:stale,Event bus:at_risk:,Gateway:on_track:stale,Cache:on_hold:");
  assertEqual(rows[1].line, "Design slipped.");
});

test("capacity: working spans without lunch; the first free slot skips the past, busy time and weekends", () => {
  assertEqual(JSON.stringify(workingSpans({})), "[[480,720],[780,1020]]");
  assertEqual(JSON.stringify(workingSpans({ lunch_start: "", lunch_end: "" })), "[[480,1020]]");
  const c = ctx();
  assertEqual(JSON.stringify(firstFreeSlot(c, { length: 60, from: { day: "2026-11-23", minute: 10 * 60 + 5 }, settings: SETTINGS.settings })),
    JSON.stringify({ day: "2026-11-23", start: 13 * 60, end: 14 * 60 }));
  const friday = firstFreeSlot(c, { length: 60, from: { day: "2026-11-27", minute: 17 * 60 }, settings: SETTINGS.settings });
  assertEqual(friday.day, "2026-11-30", "past Friday's hours: Monday, not the weekend");
  assertEqual(firstFreeSlot(c, { length: 600, from: { day: "2026-11-23", minute: 0 }, until: "2026-11-24", settings: {} }), null);
  assertEqual(dayCapacity(c, "2026-11-28", SETTINGS.settings).meetingMin, 0);
  assertEqual([hoursText(90), hoursText(45), hoursText(180)].join(), "1.5 h,45 min,3 h");
});

test("prep: open questions with the attendees, what they owe, last time", () => {
  const prep = prepFor(ctx(), 5, NOW);
  assertEqual(prep.questions.map((entry) => entry.note.title).join(), "Exactly-once?");
  assertEqual(prep.waiting.map((entry) => `${entry.task.title}${entry.late ? " (late)" : ""}`).join(), "Load-test numbers (late)");
  assertEqual(prepText({ questions: [], waiting: [] }), "");
});

test("today: keys from the table; the page starts on Up next and runs its actions", () => {
  assertTrue(TODAY_KEYS.every((entry) => entry.help));
  assertEqual(todayHints().map(([key]) => key).join(), "j k,Space,s,d,z,o");
  const section = document.createElement("section");
  document.body.append(section);
  try {
    const calls = [];
    const page = new TodayPage(section, { onOpen: (id) => calls.push(`open ${id}`), onLeave: () => calls.push("leave"), today: () => NOW,
      actions: { done: (id, done) => calls.push(`done ${id} ${done}`), schedule: (id) => calls.push(`schedule ${id}`),
        snooze: (id) => calls.push(`snooze ${id}`), answer: (id) => calls.push(`answer ${id}`), extend: (id) => calls.push(`extend ${id}`) } });
    page.show(ctx());
    const key = (k) => page.list.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const active = () => document.getElementById(page.list.getAttribute("aria-activedescendant")).textContent;
    assertTrue(active().startsWith("OVERDUE 3 D"), active());
    key(" ");
    key("j");
    key("s");
    key("z");
    key("j");
    key("s");
    assertEqual(calls.join("|"), "done 10 true|snooze 11|schedule 12", "s never places a follow-up: it is someone else's");
    key("g");
    key("g");
    key("o");
    assertEqual(calls.pop(), "open 1");
    section.querySelector(".today-now__button--done").click();
    assertEqual(calls.pop(), "done 10 true");
    assertEqual(section.querySelector(".today-now__left").textContent, "1 h left");
    key("Escape");
    assertEqual(calls.pop(), "leave");
  } finally {
    section.remove();
  }
});

test("week: estimates parse and read back; the tray groups and the due strip", async () => {
  const { parseEstimate, estimateText } = await import("../../static/js/tasks/tasks-model.js");
  const { trayGroups, dueChips, weekSummary } = await import("../../static/js/week/tray-model.js");
  assertEqual(["30", "45m", "1.5 h", "2h", "2h30", "1:15", "90 min", ""].map(parseEstimate).join(), "30,45,90,120,150,75,90,");
  let failed = false;
  try { parseEstimate("soon"); } catch { failed = true; }
  assertTrue(failed, "a word is not an estimate");
  assertEqual([estimateText(90), estimateText(45), estimateText(120), estimateText(null)].join(), "1.5 h,45 min,2 h,");
  const data = { ...ctx(), tasks: new Tasks(TASKS.map((each) => (each.id === 13 ? { ...each, estimate_min: 120 } : each))) };
  const groups = trayGroups(data, "2026-11-23", "2026-11-23");
  assertEqual(groups.map((group) => `${group.key}:${group.items.map((item) => item.entry.task.title).join("+")}`).join(" | "),
    "overdue:Draft ADR+Snoozed | week:Rate-limit review+Retry semantics | next:Pick token store | follow:Load-test numbers",
    "snoozing only leaves Today's Up next");
  const meta = (item) => item.meta.map(([text]) => text).join(" · ");
  assertEqual(meta(groups[0].items[0]), "Event bus · was due Fri 20 Nov · placed Mon");
  assertEqual(meta(groups[1].items[1]) + ` [${groups[1].items[1].estimate}]`, "Event bus · due Wed · not placed [2 h]");
  const chips = dueChips(data, ["2026-11-23", "2026-11-24", "2026-11-25"]);
  assertEqual(chips["2026-11-23"].map((chip) => chip.label).join(), "◆ Due · Rate-limit review");
  assertEqual(chips["2026-11-25"].map((chip) => `${chip.kind}:${chip.label}`).join(), "unplaced:Due · Retry semantics — not placed");
  const total = weekSummary(data, ["2026-11-23", "2026-11-28"], SETTINGS.settings);
  assertEqual([total.meetingMin, total.focusMin, total.freeMin].join(), "60,180,240", "the weekend doesn't count");
});

test("context strip: the block on now and the next meeting within 2 h; nothing near, nothing", async () => {
  const { contextOf } = await import("../../static/js/today/today-model.js");
  const strip = contextOf(ctx(), NOW);
  assertEqual([strip.block.entry.task.title, strip.next.note.title, strip.next.start].join(), "Draft ADR,Architecture review,660");
  const later = contextOf(ctx(), new Date(2026, 10, 23, 13, 0));
  assertEqual(later, null, "13:00: no block on, and no meeting before 15:00");
});
