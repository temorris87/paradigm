// The Week page's tray: every open task of mine in its group (Overdue, Due this week, Due
// later, No due date, Follow-ups), each once; the project/area filter with Other notes, and
// the hub choice remembered.
import { HUB_STORE, TaskSidebar } from "../../static/js/calendar/task-sidebar.js";
import { keysFor } from "../../static/js/hubs/hub-keys.js";
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Tasks, hubChoices } from "../../static/js/tasks/tasks-model.js";
import { OTHER_NOTES, trayGroups, weekEnd } from "../../static/js/week/tray-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
// Wednesday 25 November 2026, in the week of Monday 23 November.
const TODAY = "2026-11-25";
const MONDAY = "2026-11-23";
const NOTES = [
  { id: 1, parent_id: null, title: "Ops", kind: "area", status: "active", updated_at: T },
  { id: 2, parent_id: null, title: "Move", kind: "project", status: "active", area_id: 1, updated_at: T },
  { id: 3, parent_id: null, title: "Cache", kind: "project", status: "on_hold", area_id: 1, updated_at: T },
  { id: 4, parent_id: null, title: "Old", kind: "project", status: "active", archived_at: T, updated_at: T },
  { id: 5, parent_id: null, title: "Standup", kind: "meeting", updated_at: T },
  { id: 6, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
  { id: 7, parent_id: null, title: "Billing", kind: "project", status: "active", updated_at: T },
  { id: 8, parent_id: 2, title: "Design", kind: "phase", updated_at: T },
  { id: 9, parent_id: null, title: "Vendors", kind: "project", status: "active", updated_at: T },
];
const task = (id, noteId, title, more = {}) => ({ id, note_id: noteId, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, snoozed_until: "", estimate_min: null, ...more });
const TASKS = [
  task(10, 2, "Overdue one", { due: "2026-11-20" }),
  task(11, 7, "This week", { due: "2026-11-27" }),
  task(12, 2, "Later", { due: "2026-12-02" }),
  task(13, 7, "Undated billing"),
  task(14, 2, "Undated move"),
  task(15, 8, "Phase undated"),
  task(16, 2, "Sub", { parent_id: 14 }),
  task(17, 2, "Delegated no follow", { delegate_id: 6 }),
  task(18, 9, "Chase", { delegate_id: 6, follow_up: "2026-11-27" }),
  task(19, 2, "Done", { done: true, done_day: "2026-11-24" }),
  task(20, 3, "On hold"),
  task(21, 4, "Archived"),
  task(22, 99, "Trashed"),
  task(23, 5, "Loose"),
  task(24, 1, "Area own", { due: "2026-11-26" }),
];
const data = (tasks = TASKS) => ({ tree: new NoteTree(NOTES), tasks: new Tasks(tasks), sessions: [] });
const shape = (groups) => groups.map((group) => `${group.key}:${group.items.map((item) => item.entry.task.title).join("+")}`).join(" | ");
const titles = (groups) => groups.flatMap((group) => group.items.map((item) => item.entry.task.title)).join(",");

test("tray: every open task of mine, grouped, each once; the excluded ones absent", () => {
  const groups = trayGroups(data(), TODAY, MONDAY);
  assertEqual(shape(groups), "overdue:Overdue one | week:Area own+This week | later:Later"
    + " | undated:Undated billing+Undated move+Phase undated+Loose | follow:Chase");
  assertEqual(groups.map((group) => group.label).join(), "Overdue,Due this week,Due later,No due date,Follow-ups");
  const ids = groups.flatMap((group) => group.items.map((item) => item.entry.task.id));
  assertEqual(new Set(ids).size, ids.length, "each task once");
  for (const left of ["Sub", "Delegated no follow", "Done", "On hold", "Archived", "Trashed"]) {
    assertTrue(!titles(groups).includes(left), `${left} stays out`);
  }
  const meta = (item) => item.meta.map(([text]) => text).join(" · ");
  assertEqual(meta(groups[2].items[0]), "Move · due Wed 2 Dec · not placed");
  assertEqual(meta(groups[3].items[0]), "Billing · not placed");
  assertEqual(meta(groups[3].items[3]), "Standup · not placed", "a loose note reads as its own title");
});

test("tray: the next week moves a task from Due later to Due this week", () => {
  const groups = trayGroups(data(), TODAY, "2026-11-30");
  assertEqual(groups.find((group) => group.key === "week").items.map((item) => item.entry.task.title).join(), "Area own,This week,Later");
  assertEqual(groups.some((group) => group.key === "later"), false);
  assertEqual(weekEnd(MONDAY), "2026-11-29");
  const meta = (title) => groups.find((group) => group.key === "week").items.find((item) => item.entry.task.title === title)
    .meta.map(([text]) => text).join(" · ");
  assertEqual(meta("This week"), "Billing · due Fri 27 Nov · not placed", "a day before the week shown carries its date");
  assertEqual(meta("Later"), "Move · due Wed · not placed");
});

test("tray: a block placed shows on a No due date row", () => {
  const sessions = [{ id: 1, task_id: 14, day: "2026-11-23", start: "09:00", end: "09:30" }];
  const groups = trayGroups({ ...data(), sessions }, "2026-11-23", MONDAY);
  const row = groups.find((group) => group.key === "undated").items.find((item) => item.entry.task.id === 14);
  assertEqual(row.meta.map(([text, tone]) => `${text}/${tone ?? ""}`).join(), "Move/,placed Mon/placed");
});

test("tray: an area with its projects, a project alone, Other notes; search narrows inside", () => {
  assertEqual(titles(trayGroups(data(), TODAY, MONDAY, { hubId: 1 })), "Overdue one,Area own,Later,Undated move,Phase undated");
  assertEqual(titles(trayGroups(data(), TODAY, MONDAY, { hubId: 2 })), "Overdue one,Later,Undated move,Phase undated");
  assertEqual(titles(trayGroups(data(), TODAY, MONDAY, { hubId: OTHER_NOTES })), "Loose");
  assertEqual(titles(trayGroups(data(), TODAY, MONDAY, { hubId: 1, text: "undated" })), "Undated move,Phase undated");
  assertEqual(titles(trayGroups(data(), TODAY, MONDAY, { hubId: OTHER_NOTES, text: "billing" })), "");
});

test("tray: the filter offers hubs with a task in the tray, follow-ups too, never on hold or archived", () => {
  const { tree, tasks } = data();
  assertEqual(hubChoices(tree, tasks, { until: weekEnd(MONDAY) }).map((hub) => hub.title).join(), "Billing,Move,Ops,Vendors");
  assertEqual(hubChoices(tree, tasks, { until: "2026-11-26" }).map((hub) => hub.title).join(), "Billing,Move,Ops",
    "a follow-up after the week isn't in the tray");
});

test("tray sidebar: Other notes last, the hub remembered, a gone hub falls back to All, the empty text", () => {
  localStorage.removeItem(HUB_STORE);
  const root = document.createElement("div");
  document.body.append(root);
  const shown = (side, tasks = TASKS) => side.draw({ ...data(tasks), pending: [], hubs: [], today: TODAY, monday: MONDAY });
  try {
    const side = new TaskSidebar(root, { onTaskDown() {}, onToggle() {}, onOpen() {}, onFile() {}, onIgnore() {},
      onFilter: () => shown(side) });
    shown(side);
    const select = root.querySelector(".cal-side__hub");
    assertEqual([...select.options].map((each) => each.textContent).join(),
      "All projects and areas,Billing (Project),Move (Project),Ops (Area),Vendors (Project),Other notes");
    assertEqual(root.querySelector(".cal-side__tab").textContent, "To plan · 9", "every row counts");
    select.value = OTHER_NOTES;
    select.dispatchEvent(new Event("change"));
    assertEqual(localStorage.getItem(HUB_STORE), OTHER_NOTES);
    assertEqual([...root.querySelectorAll(".cal-task__title")].map((each) => each.textContent).join(), "Loose");

    root.replaceChildren();
    const again = new TaskSidebar(root, { onFilter() {} });
    shown(again);
    assertEqual(root.querySelector(".cal-side__hub").value, OTHER_NOTES, "kept over a reload");
    localStorage.setItem(HUB_STORE, "2");
    const reloaded = new TaskSidebar(root, { onFilter() {} });
    shown(reloaded);
    assertEqual(root.querySelector(".cal-side__hub").value, "2");
    shown(reloaded, TASKS.filter((each) => each.note_id !== 2 && each.note_id !== 8));
    assertEqual(root.querySelector(".cal-side__hub").value, "", "Move has nothing left: All");
    assertEqual(reloaded.filter.hubId, null);
    assertEqual(localStorage.getItem(HUB_STORE), null);

    shown(reloaded, TASKS.map((each) => ({ ...each, done: true })));
    assertEqual(root.querySelector(".cal-side__empty").textContent, "Nothing to plan: every task is done or delegated.");
    reloaded.filter.text = "zzz";
    shown(reloaded);
    assertEqual(root.querySelector(".cal-side__empty").textContent, "No open task matches");
  } finally {
    root.remove();
    localStorage.removeItem(HUB_STORE);
  }
});

test("next action gone: a project's Tasks keep their order, offer no Make next, and n is no key", () => {
  const section = HUB_SECTIONS.find((each) => each.key === "tasks");
  const { tree, tasks } = data();
  const rows = section.rows({ tree, tasks, sessions: [], today: new Date(2026, 10, 25), expanded: new Set() }, tree.get(2));
  assertEqual(rows.map((row) => row.title).join(), "Overdue one,Later,Undated move,Delegated no follow,Phase undated,Done");
  assertTrue(rows.every((row) => row.next === undefined && !row.actions.some((action) => action.key === "next")));
  assertTrue(!keysFor("project").some((entry) => entry.keys.includes("n")), "n is a person's key only");
});
