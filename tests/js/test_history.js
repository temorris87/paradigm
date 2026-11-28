// A project's page as in Figma (now and next) and its History page (spec 026): the head and its
// facts row, the now-and-next cuts with their footers, and the History rows, weeks, tabs,
// search and paging (static/js/history/).
import { HistoryPage } from "../../static/js/history/history-page.js";
import { HISTORY_KEYS } from "../../static/js/history/history-keys.js";
import { HISTORY_TABS, answerLine, filterRows, historyRows, pageOf, tabCounts, weekGroups } from "../../static/js/history/history-model.js";
import { meetingEnded, splitMeetings } from "../../static/js/meetings/meeting-days.js";
import { DashHead } from "../../static/js/hubs/dash-head.js";
import { HubPanel } from "../../static/js/hubs/hub-panel.js";
import { DASHBOARD_LAYOUT, HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { dueFact, headStatus, initials, milestoneFact } from "../../static/js/hubs/project-facts.js";
import { stripSummary } from "../../static/js/hubs/plan-strip.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { noteMenuItems } from "../../static/js/notes/note-menu.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { People } from "../../static/js/people/people-model.js";
import { Plan } from "../../static/js/plan/plan-model.js";
import { Records } from "../../static/js/records/records-model.js";
import { HEALTHS, StatusLogs } from "../../static/js/status/status-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
// Friday 27 Nov 2026, noon: this week is 23–29 Nov.
const NOW = new Date(2026, 10, 27, 12, 0);
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", time_code: "OPS", updated_at: T },
  { id: 2, parent_id: null, title: "Acme", kind: "project", area_id: 1, status: "active", due: "2026-12-11", time_code: "ACME-1", updated_at: T },
  { id: 3, parent_id: 2, title: "Design", kind: "phase", updated_at: T },
  { id: 4, parent_id: 3, title: "Go-live", kind: "milestone", updated_at: T },
  { id: 5, parent_id: 2, title: "Kickoff done", kind: "milestone", updated_at: T },
  { id: 9, parent_id: null, title: "Northwind", kind: "project", status: "active", due: "", updated_at: T },
  { id: 10, parent_id: null, title: "Ben Ortiz", kind: "person", updated_at: T },
  { id: 11, parent_id: null, title: "Cara Diaz", kind: "person", updated_at: T },
  { id: 20, parent_id: 2, title: "2026-11-26 Standup", kind: "meeting", updated_at: T },
  { id: 21, parent_id: 2, title: "2026-11-30 Review", kind: "meeting", updated_at: T },
  { id: 22, parent_id: 2, title: "2026-11-02 Planning", kind: "meeting", updated_at: T },
  { id: 23, parent_id: 2, title: "2026-11-27 Lunch", kind: "meeting", updated_at: T },
  { id: 30, parent_id: 2, title: "Use Postgres", kind: "decision", updated_at: T },
  { id: 31, parent_id: 2, title: "Ship in March", kind: "decision", updated_at: T },
  { id: 32, parent_id: 2, title: "One vendor", kind: "decision", updated_at: T },
  { id: 33, parent_id: 2, title: "Weekly demos", kind: "decision", updated_at: T },
  { id: 40, parent_id: 2, title: "Who owns the feed?", kind: "question", updated_at: T },
  { id: 41, parent_id: 2, title: "Which region?", kind: "question", updated_at: "2026-11-25T10:00:00.000Z" },
];
const MEETINGS = [
  { id: 20, day: "2026-11-26", time: "09:00", end_time: "09:30", attendees: [10, 11] },
  { id: 21, day: "2026-11-30", time: "10:00", end_time: "", attendees: [10] },
  { id: 22, day: "2026-11-02", time: "10:00", end_time: "", attendees: [] },
  { id: 23, day: "2026-11-27", time: "13:00", end_time: "14:00", attendees: [] },
];
const RECORDS = [
  { id: 30, kind: "decision", day: "2026-11-01", people: [] },
  { id: 31, kind: "decision", day: "2026-11-10", people: [] },
  { id: 32, kind: "decision", day: "2026-11-20", people: [] },
  { id: 33, kind: "decision", day: "2026-11-26", people: [], source_id: 20 },
  { id: 40, kind: "question", day: "2026-11-23", answered: "", people: [] },
  { id: 41, kind: "question", day: "2026-11-12", answered: "2026-11-25", people: [] },
];
const task = (id, noteId, title, more = {}) => ({ id, note_id: noteId, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, snoozed_until: "", estimate_min: null, for_person_id: null, ...more });
const TASKS = [
  task(1, 2, "Write runbook", { due: "2026-11-25" }),
  task(2, 2, "Chase vendor", { delegate_id: 10, follow_up: "2026-11-27", estimate_min: 45 }),
  task(3, 2, "Order kit", { done: true, done_day: "2026-11-24" }),
  task(4, 2, "Draft outline", { parent_id: 1, done: true, done_day: "2026-11-19" }),
  task(5, 20, "Send notes"),
];
const PLAN = {
  phases: [{ id: 3, start: "2026-11-02", end: "2026-12-18", baseline_start: "2026-11-02", baseline_end: "2026-12-18" }],
  milestones: [
    { id: 4, day: "2026-12-07", baseline_day: "2026-12-07", done_day: "" },
    { id: 5, day: "2026-11-10", baseline_day: "2026-11-10", done_day: "2026-11-10" },
  ],
};
const LOGS = [
  { id: 1, note_id: 2, day: "2026-11-20", health: "at_risk", text: "Vendor late. More to come." },
  { id: 2, note_id: 2, day: "2026-10-15", health: "on_track", text: "Fine" },
];
const PEOPLE = [
  { id: 10, org: "", job: "", email: "", hubs: [{ hub_id: 2, role: "Vendor lead" }] },
  { id: 11, org: "", job: "", email: "", hubs: [{ hub_id: 2, role: "" }] },
];
const ctx = () => ({
  tree: new NoteTree(NOTES), meetings: new Meetings(MEETINGS), records: new Records(RECORDS), tasks: new Tasks(TASKS),
  sessions: [{ id: 1, task_id: 1, day: "2026-11-30", start: "09:00", end: "11:00" }], plan: new Plan(PLAN),
  statusLogs: new StatusLogs(LOGS), people: new People(PEOPLE), today: NOW, expanded: new Set(),
});
const section = (key) => HUB_SECTIONS.find((each) => each.key === key);
const project = (c) => c.tree.get(2);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---- the project page: head and facts ----------------------------------------------------

test("project facts: due in n days, the next milestone, the head's status, initials", () => {
  const c = ctx();
  assertEqual(dueFact(project(c), NOW), "Fri 11 Dec · in 14 days");
  assertEqual(dueFact({ due: "2026-11-27" }, NOW), "Fri 27 Nov · today");
  assertEqual(dueFact({ due: "2026-11-26" }, NOW), "Thu 26 Nov · 1 day late");
  assertEqual(dueFact({ due: "" }, NOW), "");
  assertEqual(milestoneFact(c.tree, c.plan, project(c), NOW), "Go-live · Mon 7 Dec");
  const status = headStatus(c.statusLogs, project(c), NOW);
  assertEqual(`${status.label}|${status.tone}|${status.text}|${status.age}`, "At risk|caution|Vendor late.|7 d ago");
  assertEqual(headStatus(new StatusLogs([{ id: 3, note_id: 9, day: "2026-11-27", health: "blocked", text: "Stuck" }]), { id: 9 }, NOW).label,
    "Off track", "Figma's word for blocked");
  assertEqual(headStatus(c.statusLogs, { id: 9 }, NOW), null);
  assertEqual([initials("Ben Ortiz"), initials("Cher"), initials("Mary Ann Lee")].join(), "BO,C,ML");
});

test("project head: name, status line, Log status L, Open in note window ↗, History g h, ···, then the facts row", () => {
  const root = document.createElement("header");
  const ran = [];
  const controls = { due: () => ran.push("due"), area: () => ran.push("area"), timeCode: () => ran.push("code"), addPerson: () => ran.push("person") };
  const head = new DashHead(root, { onLog: () => ran.push("log"), onDigest: () => {}, onEdit: () => ran.push("edit"),
    onHistory: (note) => ran.push(`history ${note.id}`), onMenu: () => ran.push("menu"), controls: () => controls });
  const c = ctx();
  head.show(c, project(c), "");
  assertEqual(root.querySelector(".dash-head__title").textContent, "Acme");
  assertEqual(root.querySelector(".dash-head__status").textContent, "At riskVendor late.· 7 d ago");
  assertTrue(root.querySelector(".dash-head__status .chip--caution"), "At risk is caution");
  assertEqual([...root.querySelectorAll(".dash-head__button")].map((node) => node.textContent).join("|"),
    "Log status L|Open in note window ↗|History g h|···");
  for (const button of root.querySelectorAll(".dash-head__button")) button.click();
  assertEqual(ran.splice(0).join(), "log,edit,history 2,menu");
  const facts = [...root.querySelectorAll(".dash-facts__fact")].map((node) => `${node.querySelector("dt").textContent}=${node.querySelector("dd").textContent}`);
  assertEqual(facts.join("|"), "Due=Fri 11 Dec · in 14 days|Next milestone=Go-live · Mon 7 Dec|Area=Operations|People=BOCD+ Add|Time code=ACME-1");
  for (const button of root.querySelectorAll(".dash-facts__button")) button.click();
  assertEqual(ran.join(), "due,area,person,code");
  head.show({ ...c, statusLogs: new StatusLogs() }, c.tree.get(9), "");
  assertEqual(root.querySelector(".dash-head__status").textContent, "No status yet · L to log");
  assertEqual([...root.querySelectorAll(".dash-facts__value")].map((node) => node.textContent).join("|"), "—|—|—|+ Add|—", "empty: —");
});

test("project menu: in the main window, ··· also holds the area and the status the card had", () => {
  const tree = new NoteTree(NOTES);
  const keys = (id, window) => noteMenuItems(tree, id, { window }).filter((item) => item.key).map((item) => item.key);
  assertTrue(keys(2, "main").includes("area") && keys(2, "main").includes("status"));
  assertTrue(keys(2, "main").includes("file"), "and its kind: File as");
  assertTrue(!keys(2, "note").includes("area"), "the note window keeps its card");
  assertTrue(!keys(1, "main").includes("status"), "an area has none");
  assertEqual(noteMenuItems(tree, 2, { window: "main" }).find((item) => item.key === "status").label, "Put on hold");
});

test("plan strip: the phases in one line", () => {
  assertEqual(stripSummary({ segments: [{ state: "done", title: "A" }, { state: "current", title: "Build" }, { state: "future", title: "C" }] }),
    "3 phases · now Build · 1 done");
});

// ---- the project page: now and next ------------------------------------------------------

test("now and next: open tasks only, with a chip and what each takes; the footer counts the done ones", () => {
  const c = ctx();
  const rows = section("openTasks").rows(c, project(c));
  assertEqual(rows.map((row) => row.title).join(), "Write runbook,Chase vendor,Send notes", "a meeting's task too");
  assertEqual(rows.map((row) => row.chip ? `${row.chip.text}/${row.chip.tone}` : "-").join(), "2 d late/danger,Ben Ortiz · follow up today/info,-");
  assertEqual(rows.map((row) => row.detail).join("|"), "1/1 subtask · 2 h placed|45 min|");
  assertEqual(section("openTasks").detail(rows), "3 open");
  assertEqual(section("openTasks").footer(c, project(c)).text, "Open and upcoming only · 2 done", "as History's Done tasks: subtasks too");
  assertEqual(section("openTasks").footer(c, project(c)).count, tabCounts(historyRows(c, project(c))).tasks);
  assertEqual(section("openTasks").footer(c, project(c)).tab, "tasks");
  assertEqual(section("openTasks").base, "tasks", "it adds and acts as Tasks");
  const shelved = { ...c, tree: new NoteTree(NOTES.map((note) => note.id === 2 ? { ...note, archived_at: T } : note)) };
  const archived = section("openTasks").rows(shelved, project(shelved));
  assertEqual(archived[0].detail, "1/1 subtask · 2 h placed · archived", "why it is muted, with no actions");
  assertEqual(`${archived[0].muted} ${archived[0].actions.length}`, "true 0");
});

test("now and next: a section with no rows keeps its footer while History has some; Answered questions on the foot line", () => {
  const root = document.createElement("section");
  const asked = [];
  const panel = new HubPanel(root, { onRow() {}, onToggle() {}, onMore() {}, onAdd: (s) => asked.push(`add ${s.key}`), onRowAction() {},
    onHistory: (tab) => asked.push(`history ${tab}`) });
  const drawn = (key, label, more = {}) => ({ key, label, detail: "", folded: false, rows: [], empty: `No ${label}`, add: null,
    addPlain: false, menu: null, more: 0, footer: null, history: null, ...more });
  panel.draw({ wide: [], emptyLine: "foot",
    act: [drawn("openTasks", "Tasks", { add: "Task", footer: { text: "Open and upcoming only · 5 done", tab: "tasks", count: 5 } })],
    know: [drawn("notes", "Notes", { add: "Note" }), drawn("projectAnswered", "Answered questions", { history: "answered" })] });
  assertTrue(root.querySelector(".hub__section--openTasks .hub__footer"), "all done: Tasks stays, with its footer");
  const foot = [...root.querySelectorAll(".hub__empties--foot .hub__empty-label")];
  assertEqual(foot.map((node) => node.textContent).join(","), "+ Notes,Answered questions");
  foot[1].closest(".hub__empty-item").click();
  root.querySelector(".hub__section--openTasks .hub__footer").click();
  assertEqual(asked.join(), "history answered,history tasks");
  assertTrue(DASHBOARD_LAYOUT.project.know.includes("projectAnswered"));
});

test("now and next: open questions with ? and their age; the footer counts the answered", () => {
  const c = ctx();
  const rows = section("projectQuestions").rows(c, project(c));
  assertEqual(rows.map((row) => `${row.chip.text}|${row.title}|${row.date}`).join(), "?|Who owns the feed?|asked 23 Nov · 4 d");
  assertEqual(section("projectQuestions").footer(c, project(c)).text, "1 answered");
  assertEqual(section("projectQuestions").footer(c, project(c)).tab, "answered");
});

test("now and next: Meetings shows the next still to come and the last that ended; the footer counts the earlier", () => {
  const c = ctx();
  const rows = section("nextMeetings").rows(c, project(c));
  assertEqual(rows.map((row) => `${row.lead}|${row.chip.text}|${row.title}|${row.detail}`).join(" / "),
    "Next|Fri 27 Nov|Lunch|0 attending / Last|Thu 26 Nov|Standup|2 attending", "today's 13:00 is still to come at noon");
  assertEqual(section("nextMeetings").detail(rows, c, project(c)), "4", "the heading counts them all");
  assertEqual(section("nextMeetings").footer(c, project(c)).text, "1 earlier");
  const later = { ...c, today: new Date(2026, 10, 27, 15, 0) };
  assertEqual(section("nextMeetings").rows(later, project(c)).map((row) => `${row.lead} ${row.title}`).join(), "Next Review,Last Lunch");
});

test("now and next: the latest 3 decisions, 'Latest 3 shown · n in all'; people with what is between us", () => {
  const c = ctx();
  const rows = section("latestDecisions").rows(c, project(c));
  assertEqual(rows.map((row) => `${row.chip.text} ${row.title}`).join(), "Thu 26 Nov Weekly demos,Fri 20 Nov One vendor,Tue 10 Nov Ship in March");
  assertEqual(section("latestDecisions").footer(c, project(c)).text, "Latest 3 shown · 4 in all");
  assertEqual(section("latestDecisions").footer(c, project(c)).tab, "decisions");
  const people = section("projectPeople").rows(c, project(c));
  assertEqual(people.map((row) => `${row.avatar}|${row.title}|${row.detail}`).join(" / "), "BO|Ben Ortiz|Vendor lead · 1 waiting / 0 owed / CD|Cara Diaz|");
});

test("now and next: the Outcome is the project's text, first line over the rest", () => {
  const c = { ...ctx(), body: { id: 2, text: "# Pilot live in two depots. Then all.\n\nNo outage." } };
  const rows = section("outcome").rows(c, project(c));
  assertEqual(rows.map((row) => `${row.title}|${row.snippet}|${row.outcome}`).join(), "Pilot live in two depots.|No outage.|true");
  assertEqual(section("outcome").rows({ ...c, body: { id: 9, text: "Other" } }, project(c)).length, 0, "another note's text is not its");
});

// ---- the History page --------------------------------------------------------------------

test("history: every dated thing, newest first, each with its day, kind chip and detail", () => {
  const c = ctx();
  const rows = historyRows(c, project(c), { answers: new Map([[41, "EU first"]]) });
  assertEqual(rows.map((row) => `${row.day} ${row.chip.text}/${row.chip.tone} ${row.title} · ${row.detail}`).join("\n"), [
    "2026-11-26 Meeting/info Standup · 2 attending · 1 task, 1 decision captured",
    "2026-11-26 Decision/decision Weekly demos · from Standup",
    "2026-11-25 Answered/question Which region? · EU first",
    "2026-11-24 Done/success Order kit · ",
    "2026-11-20 At risk/caution Vendor late. · status log",
    "2026-11-20 Decision/decision One vendor · ",
    "2026-11-19 Done/success Draft outline · subtask of Write runbook",
    "2026-11-10 Milestone/info Kickoff done · ",
    "2026-11-10 Decision/decision Ship in March · ",
    "2026-11-02 Meeting/info Planning · 0 attending",
    "2026-11-01 Decision/decision Use Postgres · ",
    "2026-10-15 On track/success Fine · status log",
  ].join("\n"), "meetings still to come are left out; Go-live is still ahead");
  assertEqual(JSON.stringify(tabCounts(rows)), JSON.stringify({ everything: 12, meetings: 2, tasks: 2, decisions: 4, answered: 1 }));
  assertEqual(HISTORY_TABS.map((tab) => tab.label).join(), "Everything,Meetings,Done tasks,Decisions,Answered");
  const delegated = historyRows({ ...c, tasks: new Tasks([task(7, 2, "Book room", { delegate_id: 11, done: true, done_day: "2026-11-26" })]) }, project(c));
  assertEqual(delegated.find((row) => row.kind === "task").detail, "delegated to Cara Diaz");
});

test("history: two status logs on one day, the later one first, as Off track where it says blocked", () => {
  const c = ctx();
  const logs = new StatusLogs([...LOGS,
    { id: 3, note_id: 2, day: "2026-11-27", health: "on_track", text: "Contract signed with Acme." },
    { id: 4, note_id: 2, day: "2026-11-27", health: "blocked", text: "Site access blocked." }]);
  const rows = historyRows({ ...c, statusLogs: logs }, project(c)).filter((row) => row.day === "2026-11-27");
  assertEqual(rows.map((row) => `${row.chip.text} ${row.title}`).join("|"),
    "Off track Site access blocked.|On track Contract signed with Acme.");
  assertEqual(HEALTHS.map((health) => health.label).join(), "On track,At risk,Off track", "Log status uses the same words");
});

test("history: weeks newest first, This week first; 4 weeks a page; tabs and search filter", () => {
  const c = ctx();
  const rows = historyRows(c, project(c));
  const groups = weekGroups(rows, NOW);
  assertEqual(groups.map((group) => `${group.label}:${group.rows.length}`).join(),
    "This week · 23–29 Nov:4,16–22 Nov:3,9–15 Nov:2,2–8 Nov:1,26 Oct – 1 Nov:1,12–18 Oct:1");
  const page = pageOf(groups);
  assertEqual(`${page.groups.length} ${page.more}`, "4 true");
  assertEqual(pageOf(groups, 8).more, false);
  assertEqual(filterRows(rows, "tasks").map((row) => row.title).join(), "Order kit,Draft outline");
  assertEqual(filterRows(rows, "everything", "VENDOR").map((row) => row.title).join(), "Vendor late.,One vendor", "titles and details");
  assertEqual(filterRows(rows, "meetings", "standup captured").map((row) => row.title).join(), "Standup", "every word");
  assertEqual(weekGroups([{ day: "2025-12-30" }], NOW)[0].label, "29 Dec 2025 – 4 Jan", "the year only where it is not this one");
});

test("history: when a meeting has ended; a question's answer is its note's last paragraph", () => {
  assertTrue(meetingEnded({ day: "2026-11-26", time: "" }, NOW), "yesterday's");
  assertTrue(!meetingEnded({ day: "2026-11-27", time: "" }, NOW), "today's with no time: all day");
  assertTrue(meetingEnded({ day: "2026-11-27", time: "11:00", end_time: "" }, NOW), "11:00 + 30 min");
  assertTrue(!meetingEnded({ day: "2026-11-27", time: "11:00", end_time: "12:30" }, NOW));
  const entry = (id, day, time, more = {}) => ({ note: { id }, meeting: { day, time, ...more }, archived: false });
  const split = splitMeetings([entry(1, "2026-11-20", "09:00"), entry(2, "2026-12-01", "09:00"), entry(3, "2026-11-30", "09:00"),
    entry(4, "2026-11-30", "08:00", { cancelled: true })], NOW);
  assertEqual(`${split.coming.map((e) => e.note.id)}|${split.ended.map((e) => e.note.id)}`, "3,2|1", "cancelled ones are neither");
  assertEqual(answerLine("Who knows.\n\nWe asked around.\n\n- Use the EU region\nfor now\n"), "Use the EU region");
  assertEqual(answerLine(""), "");
});

test("history keys: j k, Enter, 1-5, /, Esc; Enter or Esc in the search box goes back to the list", () => {
  const caps = HISTORY_KEYS.filter((entry) => entry.scope === "list" && entry.hint).map((entry) => entry.hint).join();
  assertEqual(caps, "move,open,tab,search,back to project");
  assertEqual(HISTORY_KEYS.filter((entry) => entry.scope === "search").map((entry) => entry.keys.join("+")).join(), "Enter+Escape");
});

/** A History page on Acme, with an app that records what it was asked. */
function historyPage(calls) {
  const section = document.createElement("section");
  document.body.append(section);
  const app = {
    currentId: 2,
    historyRequest: { id: 2, tab: "everything" },
    api: { get: async () => ({ body: "Talked it over.\n\nEU first, then the rest." }) },
    guard: (work) => Promise.resolve(work).catch((error) => calls.push(`error ${error.message}`)),
    showTask: (id) => calls.push(`task ${id}`),
    open: (id) => calls.push(`open ${id}`),
  };
  const page = new HistoryPage(section, { app: () => app, onLeave: () => calls.push("leave") });
  return { section, page, app };
}

const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const titles = (section) => [...section.querySelectorAll(".history__row-title")].map((node) => node.textContent).join(",");
const weeks = (section) => [...section.querySelectorAll(".history__week-head")].map((node) => node.textContent).join(",");

test("history page: the bar, 4 weeks, tabs by number, search as you type, Enter opens, Esc back to the project", async () => {
  const calls = [];
  const { section, page, app } = historyPage(calls);
  try {
    page.enter();
    page.show(ctx());
    assertEqual(section.querySelector(".history__title").textContent, "Acme · History");
    assertEqual([...section.querySelectorAll(".history__tab")].map((node) => node.textContent).join(),
      "Everything,Meetings 2,Done tasks 2,Decisions 4,Answered 1");
    assertEqual(weeks(section), "This week · 23–29 Nov,16–22 Nov,9–15 Nov,2–8 Nov");
    assertEqual(section.querySelector(".history__search").placeholder, "Search history /");
    assertEqual(page.crumbs(ctx()).map((part) => part.label).join(" › "), "Projects › Acme › History");
    page.focus();
    press("Enter");
    assertEqual(calls.pop(), "open 20", "a meeting opens its note");
    press("3");
    assertEqual(titles(section), "Order kit,Draft outline");
    press("Enter");
    assertEqual(calls.pop(), "task 3", "a done task opens its page");
    press("1");
    press("/");
    assertTrue(document.activeElement === section.querySelector(".history__search"));
    const search = section.querySelector(".history__search");
    search.value = "vendor";
    search.dispatchEvent(new Event("input"));
    assertEqual(titles(section), "Vendor late.,One vendor");
    press("Escape");
    assertTrue(document.activeElement === section.querySelector(".history__list"), "Esc in the box: back to the list");
    search.value = "";
    search.dispatchEvent(new Event("input"));
    await tick();
    assertTrue(section.textContent.includes("EU first, then the rest."), "an answer's first line, read from its note");
    press("Escape");
    assertEqual(calls.pop(), "leave");
    app.historyRequest = { id: 2, tab: "decisions" };
    page.enter();
    page.show(ctx());
    assertEqual(titles(section), "Weekly demos,One vendor,Ship in March,Use Postgres", "a section's History ↗ opens on its tab");
    page.enter();
    press("2");
    page.enter();
    page.show(ctx());
    assertEqual(titles(section), "Standup,Planning", "the same ask again (Back from a row's page) keeps where it was");
  } finally {
    section.remove();
  }
});

test("history page: a redraw (more weeks) leaves the scroll be; only a move shows the row", () => {
  const calls = [];
  const { section, page } = historyPage(calls);
  const scrolled = [];
  const before = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView() {
    scrolled.push(this.id);
  };
  try {
    page.enter();
    page.show(ctx());
    page.loadMore();
    assertEqual(scrolled.length, 0, "drawing the next weeks keeps the view where the mouse put it");
    page.focus();
    press("j");
    assertEqual(scrolled.join(), "history-row-1");
  } finally {
    Element.prototype.scrollIntoView = before;
    section.remove();
  }
});

test("history page: j past the last row draws the next 4 weeks", () => {
  const calls = [];
  const { section, page } = historyPage(calls);
  try {
    page.enter();
    page.show(ctx());
    page.focus();
    assertEqual(section.querySelectorAll(".history__row").length, 10);
    for (let n = 0; n < 9; n += 1) press("j");
    assertEqual(section.querySelectorAll(".history__week").length, 4, "still 4 weeks on the last row");
    press("j");
    assertEqual(section.querySelectorAll(".history__week").length, 6);
    assertEqual(section.querySelector("[aria-selected=true] .history__row-title").textContent, "Use Postgres", "on to the next row");
  } finally {
    section.remove();
  }
});

test("history: g h on anything but a project says so", async () => {
  const tree = new NoteTree(NOTES);
  const app = { role: "main", tree, currentId: 10, views: { shown: null } };
  const message = async (work) => {
    try {
      await work();
      return "";
    } catch (error) {
      return error.message;
    }
  };
  assertEqual(await message(() => NotesApp.prototype.showHistory.call(app, 10)), "E: History is a project's", "a person");
  assertEqual(await message(() => NotesApp.prototype.showHistory.call(app, 3)), "E: History is a project's", "a phase");
  const onToday = { ...app, views: { shown: "home" }, showHistory: NotesApp.prototype.showHistory };
  assertEqual(await message(() => NotesApp.prototype.historyKey.call(onToday)), "E: History is a project's", "Today");
});

test("page views: a note opened from History is a step over it, so Back returns to History", () => {
  const main = document.createElement("main");
  const page = () => ({ section: document.createElement("section"), focus() {}, show() {} });
  const pages = { history: page(), live: page(), home: page() };
  const steps = [];
  const history = { state: null, pushState(state, _, url) { this.state = state; steps.push(["push", url]); },
    replaceState(state, _, url) { this.state = state; steps.push(["replace", url]); }, back() {} };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=3" });
  views.show("history", "push", "history=3");
  views.show("live", "push");
  assertEqual(JSON.stringify(steps), JSON.stringify([["push", "/?note=3&history=3"], ["push", "/?note=3&live"]]));
  views.show("home", "push");
  assertEqual(steps.at(-1).join(" "), "replace /?note=3&home", "other pages still take one step");
});
