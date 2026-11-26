// The task page (static/js/tasks/task-page.js): its rows (taskTree), J/K's target, its key
// table, its facts, the gone states, and the page drawn with a fake app. Also the section's
// Enter (the task page) and z (in place), and the delete confirm's count.
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { newTaskDialog, removeTaskText } from "../../static/js/tasks/task-commands.js";
import { TASK_PAGE_KEYS, taskPageAction } from "../../static/js/tasks/task-page-keys.js";
import { TaskPage, goneReason, headFacts, rowFacts } from "../../static/js/tasks/task-page.js";
import { MAX_TASK_DEPTH, Tasks, moveTarget, taskTree } from "../../static/js/tasks/tasks-model.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const assertEqual = (actual, expected, message = "") => same(JSON.stringify(actual), JSON.stringify(expected), message);

const NOTES = [
  { id: 1, parent_id: null, title: "Move", kind: "project" },
  { id: 2, parent_id: 1, title: "Packing" },
  { id: 3, parent_id: null, title: "Priya Shah", kind: "person" },
  { id: 4, parent_id: null, title: "Old", kind: "project", archived_at: "2026-11-01T00:00:00Z" },
];
const task = (id, title, more = {}) => ({ id, note_id: 1, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, estimate_min: null, for_person_id: null, ...more });
const TASKS = [
  task(10, "Book van", { notes: "Ask **twice**", due: "2026-11-30" }),
  task(11, "Get quotes", { parent_id: 10, notes: "Three of them" }),
  task(12, "Call movers", { parent_id: 11, delegate_id: 3, follow_up: "2026-11-27" }),
  task(13, "Pick a date", { parent_id: 10, done: true, done_day: "2026-11-20" }),
  task(14, "Ask Jo", { parent_id: 11 }),
  task(20, "Tape", { note_id: 2 }),
  task(30, "Old one", { note_id: 4 }),
];
const tree = () => new NoteTree(NOTES);
const tasks = () => new Tasks(TASKS);
const TODAY = new Date(2026, 10, 26);

test("task page: the rows are the tree under the task, in order, with their depth", () => {
  assertEqual(taskTree(tasks(), 10).map(({ task: each, depth, parent }) => [each.id, depth, parent.id]),
    [[11, 1, 10], [12, 2, 11], [14, 2, 11], [13, 1, 10]]);
  assertEqual(taskTree(tasks(), 11).map(({ task: each, depth }) => [each.id, depth]), [[12, 1], [14, 1]], "a subtask's page starts at 1");
  assertEqual(tasks().descendantsOf(10).map((each) => each.id), [11, 12, 14, 13]);
  assertEqual(tasks().ancestorsOf(14).map((each) => each.id), [10, 11]);
  assertEqual(tasks().ancestorsOf(10), []);
  assertEqual(MAX_TASK_DEPTH, 5);
});

test("task page: J/K move a subtask among its siblings only", () => {
  assertEqual(moveTarget(tasks(), 11, 1), { beforeId: null }, "down past the last: at the end");
  assertEqual(moveTarget(tasks(), 13, -1), { beforeId: 11 });
  assertEqual(moveTarget(tasks(), 13, 1), null, "last already");
  assertEqual(moveTarget(tasks(), 11, -1), null, "first already");
  assertEqual(moveTarget(tasks(), 12, 1), { beforeId: null });
  assertEqual(moveTarget(tasks(), 10, 1), null, "a top-level task isn't moved here");
  const four = new Tasks([task(1, "a"), task(2, "b", { parent_id: 1 }), task(3, "c", { parent_id: 1 }), task(4, "d", { parent_id: 1 })]);
  assertEqual(moveTarget(four, 2, 1), { beforeId: 4 });
});

test("task page: its key table", () => {
  const key = (k) => taskPageAction(new KeyboardEvent("keydown", { key: k }));
  assertEqual(["j", "ArrowDown", "k", "ArrowUp", "G", "Enter", "a", " ", "e", "d", "x", "Delete", "J", "K", "Escape"].map(key),
    ["next", "next", "previous", "previous", "last", "open", "add", "toggle", "edit", "delegate", "remove", "remove", "moveDown", "moveUp", "leave"]);
  assertEqual([key("g"), key("g")], ["pending", "first"]);
  assertEqual(taskPageAction(new KeyboardEvent("keydown", { key: "j", ctrlKey: true })), null);
  assertTrue(TASK_PAGE_KEYS.every((entry) => entry.help), "every key has its help");
});

test("task page: the head's facts and a row's", () => {
  const ctx = { tree: tree(), tasks: tasks(), today: TODAY };
  assertEqual(headFacts(ctx, tasks().get(10)).map((fact) => fact.text), ["due Mon 30 Nov"]);
  const facts = headFacts(ctx, { ...tasks().get(20), estimate_min: 90, for_person_id: 3 });
  assertEqual(facts.map((fact) => fact.text), ["for Priya Shah", "1.5 h", "on Packing"]);
  assertEqual(facts[2].noteId, 2, "the note is a link");
  assertTrue(headFacts(ctx, tasks().get(30)).some((fact) => fact.text.includes("read-only")));
  assertEqual(rowFacts(ctx, tasks().get(12)), "→ Priya Shah, follow up Fri 27 Nov");
  assertEqual(rowFacts(ctx, tasks().get(13)), "done Fri 20 Nov");
});

test("task page: gone, or its note in the trash", () => {
  const last = { id: 20, notes: [2, 1] };
  assertEqual(goneReason({ tree: tree(), trash: { entries: [] } }, last), "gone", "deleted, its note still here");
  assertEqual(goneReason({ tree: new NoteTree(NOTES.slice(2)), trash: { entries: [{ id: 1 }] } }, last), "trashed");
  assertEqual(goneReason({ tree: tree(), trash: { entries: [] } }, null), "gone", "never drawn: gone");
  assertEqual(goneReason({ tree: new NoteTree(NOTES.slice(2)), trash: { entries: [{ id: 1 }] }, taskNoteId: 1 }, null), "trashed",
    "never drawn (a reload): the URL's note is in the trash");
  assertEqual(goneReason({ tree: tree(), trash: { entries: [{ id: 9 }] }, taskNoteId: 1 }, null), "gone");
});

test("task page: the delete confirm counts every level", () => {
  assertEqual(removeTaskText({ title: "Book van" }, 4), 'Delete "Book van" and the 4 subtasks under it? Any time logged on it stays on the timesheet.');
  assertEqual(removeTaskText({ title: "A" }, 1), 'Delete "A" and its subtask? Any time logged on it stays on the timesheet.');
  assertEqual(removeTaskText({ title: "A" }, 0), 'Delete "A"? Any time logged on it stays on the timesheet.');
});

function fakeApp(state) {
  const calls = [];
  return {
    calls,
    tasks: state.tasks,
    tree: state.tree,
    guard: (promise) => promise?.catch?.((error) => calls.push(["error", error.message])),
    open: async (id) => calls.push(["open", id]),
    showTask: async (id) => calls.push(["showTask", id]),
    showView: (key) => calls.push(["view", key]),
    say: (text) => calls.push(["say", text]),
    markdownOptions: () => ({}),
    focusNote() {},
    changes: { send() {} },
    tasksApi: { move: async (id, before) => calls.push(["move", id, before]), setDone: async (id, done) => calls.push(["done", id, done]),
      remove: async (id) => calls.push(["remove", id]), create: async (...args) => calls.push(["create", ...args]) },
    refreshTree: async () => {},
  };
}

function withPage(body, { taskId = 10, list = TASKS } = {}) {
  const section = document.createElement("section");
  document.body.append(section);
  const ctx = { tree: tree(), tasks: new Tasks(list), trash: { entries: [] }, taskId, today: TODAY };
  const app = fakeApp(ctx);
  let left = 0;
  const page = new TaskPage(section, { app: () => app, onLeave: () => { left += 1; } });
  try {
    page.show(ctx);
    return body({ page, section, app, ctx, left: () => left });
  } finally {
    section.remove();
  }
}

const press = (section, key, more = {}) => section.querySelector(".task-page__body")
  .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...more }));
const selected = (section) => section.querySelector("[aria-selected=true] .task-page__title, [aria-selected=true] .task-page__row-title")?.textContent;

test("task page: breadcrumb, head, the two-column table with each subtask's notes", () => withPage(({ section, app }) => {
  const crumbs = [...section.querySelectorAll(".task-page__crumbs button, .task-page__crumb-here")].map((n) => n.textContent);
  assertEqual(crumbs, ["Move", "Book van"]);
  assertEqual(section.querySelector(".task-page__head .task-page__title").textContent, "Book van");
  assertTrue(section.querySelector(".task-page__notes--head strong")?.textContent === "twice", "its notes, rendered");
  const rows = [...section.querySelectorAll(".task-page__row")];
  assertEqual(rows.map((row) => row.querySelector(".task-page__row-title").textContent), ["Get quotes", "Call movers", "Ask Jo", "Pick a date"]);
  assertEqual(rows.map((row) => [...row.classList].find((c) => c.startsWith("task-page__row--depth-"))),
    ["task-page__row--depth-1", "task-page__row--depth-2", "task-page__row--depth-2", "task-page__row--depth-1"]);
  assertEqual(rows[0].querySelector(".task-page__cell-notes").textContent.trim(), "Three of them");
  assertEqual(rows[1].querySelector(".task-page__cell-notes").textContent, "", "an empty notes cell stays blank");
  assertTrue(rows[3].classList.contains("task-page__row--done"), "a done one stays in place, muted");
  assertTrue(section.querySelector(".task-page__add"), "+ Add subtask");
  section.querySelector(".task-page__crumbs button").click();
  assertEqual(app.calls.at(-1), ["open", 1], "the hub opens its dashboard");
}));

test("task page: j/k/G/gg move, Enter opens a subtask's page, J moves it, Escape leaves", () => withPage(({ section, app, left }) => {
  assertEqual(selected(section), "Book van", "the head is row 0");
  press(section, "Enter");
  assertEqual(app.calls.length, 0, "Enter on the head does nothing");
  press(section, "j");
  assertEqual(selected(section), "Get quotes");
  press(section, "Enter");
  assertEqual(app.calls.at(-1), ["showTask", 11]);
  press(section, "G");
  assertEqual(selected(section), "Pick a date");
  press(section, "K", { shiftKey: true });
  press(section, "g");
  press(section, "g");
  assertEqual(selected(section), "Book van");
  press(section, "Escape");
  assertEqual(left(), 1);
}));

test("task page: another task's page starts on its head", () => withPage(({ page, section, ctx }) => {
  press(section, "j");
  press(section, "j");
  assertEqual(selected(section), "Call movers");
  page.show({ ...ctx, taskId: 11 });
  assertEqual(selected(section), "Get quotes", "not the row the last page had selected");
  press(section, "G");
  page.show({ ...ctx, taskId: 11 });
  assertEqual(selected(section), "Ask Jo", "a redraw of the same page keeps its row");
}));

test("task page: the move waits for its call", async () => {
  const section = document.createElement("section");
  document.body.append(section);
  const ctx = { tree: tree(), tasks: tasks(), trash: { entries: [] }, taskId: 10, today: TODAY };
  const app = fakeApp(ctx);
  const page = new TaskPage(section, { app: () => app, onLeave() {} });
  try {
    page.show(ctx);
    press(section, "G");
    press(section, "K", { shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEqual(app.calls.find((call) => call[0] === "move"), ["move", 13, 11]);
    press(section, "g");
    press(section, "g");
    press(section, "J", { shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEqual(app.calls.filter((call) => call[0] === "move").length, 1, "the head doesn't move");
  } finally {
    section.remove();
  }
});

test("task page: no notes, no subtasks; archived is read-only; gone", () => {
  withPage(({ section }) => {
    assertEqual(section.querySelector(".task-page__no-notes").textContent, "No notes — e to add");
    assertEqual(section.querySelectorAll(".task-page__row").length, 0);
    assertTrue(section.querySelector(".task-page__add"));
  }, { taskId: 20 });
  withPage(({ section, app }) => {
    assertEqual(section.querySelector(".task-page__add"), null, "no Add");
    assertEqual(section.querySelectorAll(".task-page__actions").length, 0, "no row buttons");
    press(section, " ");
    assertTrue(app.calls.at(-1)[0] === "say" && !app.calls.some((call) => call[0] === "done"), "Space only says why");
  }, { taskId: 30 });
  withPage(({ page, section, ctx }) => {
    page.show({ ...ctx, tasks: new Tasks(TASKS.filter((each) => each.id !== 20)) });
    assertEqual(section.querySelector(".task-page__title").textContent, "This task is gone");
    assertTrue([...section.querySelectorAll("button")].some((n) => n.textContent === "‹ Back"), "and a Back link");
  }, { taskId: 20 });
  withPage(({ page, section, ctx }) => {
    page.show({ ...ctx, tree: new NoteTree(NOTES.filter((note) => note.id !== 2)), tasks: new Tasks(TASKS.filter((each) => each.id !== 20)),
      trash: { entries: [{ id: 2 }] } });
    assertEqual(section.querySelector(".task-page__title").textContent, "Its note is in the trash");
  }, { taskId: 20 });
});

test("sections: Enter on a task opens its page, z opens it in place", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  const asked = [];
  const hub = new HubPage({ page, line, section, onOpen: () => {}, onLeave: () => {},
    tabActions: { add() {}, row: (key, sectionKey, owner, row) => asked.push([key, row.task]) } });
  const ctx = { tree: tree(), tasks: tasks(), today: TODAY };
  try {
    hub.show(ctx, 1);
    const list = section.querySelector("#hub-list");
    list.focus();
    const key = (k) => list.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    key("Enter");
    assertEqual(asked.at(-1), ["openTask", 10]);
    key("z");
    const titles = [...section.querySelectorAll(".hub__section--tasks .hub__title")].map((n) => n.textContent);
    assertEqual(titles.slice(0, 6), ["Book van", "Get quotes", "Call movers", "Ask Jo", "Pick a date", "+ Add subtask"]);
    const deep = [...section.querySelectorAll(".hub__row")].find((n) => n.textContent.includes("Call movers"));
    assertTrue(deep.classList.contains("hub__row--task") && deep.classList.contains("hub__row--depth-2"), deep.className);
    key("j");
    key("j");
    key("Enter");
    assertEqual(asked.at(-1), ["openTask", 12], "a subtask in place opens its own page");
  } finally {
    page.remove();
  }
});

test("page views: a page shown again with another flag takes the URL's place", () => {
  const main = document.createElement("main");
  const pages = { task: { section: document.createElement("section"), focus() {}, show() {} } };
  const steps = [];
  const history = { state: null, pushState(state, _, url) { this.state = state; steps.push(["push", url]); },
    replaceState(state, _, url) { this.state = state; steps.push(["replace", url]); }, back() {} };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=1" });
  assertEqual(views.fromUrl(new URLSearchParams("note=1&task=10")), "task");
  views.show("task", "push", "task=10");
  views.show("task", "push", "task=11");
  assertEqual(steps, [["push", "/?note=1&task=10"], ["replace", "/?note=1&task=11"]]);
  assertEqual(history.state, { view: "task" }, "still one step back to where the first was opened from");
});

test("page views: a task page over another page is its own step, so Back returns there", () => {
  const main = document.createElement("main");
  const page = () => ({ section: document.createElement("section"), focus() {}, show() {} });
  const pages = { task: page(), week: page(), home: page() };
  const steps = [];
  const history = { state: null, pushState(state, _, url) { this.state = state; steps.push(["push", url]); },
    replaceState(state, _, url) { this.state = state; steps.push(["replace", url]); }, back() {} };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=1" });
  views.show("week", "push");
  views.show("task", "push", "task=10");
  assertEqual(steps, [["push", "/?note=1&week"], ["push", "/?note=1&task=10"]]);
  views.show("home", "push");
  assertEqual(steps.at(-1), ["replace", "/?note=1&home"], "other pages still take one step");
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Deletes a row of Book van's page through x and the confirm; returns how often it left. */
async function deleteRow(rowIndex) {
  const section = document.createElement("section");
  document.body.append(section);
  const ctx = { tree: tree(), tasks: new Tasks(TASKS), trash: { entries: [] }, taskId: 10, today: TODAY };
  const app = fakeApp(ctx);
  let left = 0;
  const page = new TaskPage(section, { app: () => app, onLeave: () => { left += 1; } });
  try {
    page.show(ctx);
    for (let step = 0; step < rowIndex; step += 1) press(section, "j");
    press(section, "x");
    document.querySelector("dialog .dialog__button--ok").click();
    for (let wait = 0; wait < 5; wait += 1) await tick();
    return { left, calls: app.calls };
  } finally {
    document.querySelector("dialog")?.remove();
    section.remove();
  }
}

test("task page: deleting its head goes back; deleting a subtask stays", async () => {
  const head = await deleteRow(0);
  assertEqual(head.calls.filter(([kind]) => kind === "remove"), [["remove", 10]]);
  assertEqual(head.left, 1, "back to the dashboard, not 'This task is gone'");
  const sub = await deleteRow(1);
  assertEqual(sub.calls.filter(([kind]) => kind === "remove"), [["remove", 11]]);
  assertEqual(sub.left, 0);
});

test("new subtask: a 6th level is refused in the dialog before any call, a 5th can be added", async () => {
  const chain = Array.from({ length: MAX_TASK_DEPTH }, (_, at) => task(40 + at, `Level ${at + 1}`, { parent_id: at ? 39 + at : null }));
  const app = fakeApp({ tasks: new Tasks(chain), tree: tree() });
  const refusing = newTaskDialog(app, tree().get(1), chain[MAX_TASK_DEPTH - 1]);
  const deep = document.querySelector("dialog");
  assertTrue(deep, "the dialog opens, so typed keys never reach the page");
  deep.querySelector("input").value = "Too deep";
  deep.querySelector("form").requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const error = deep.querySelector(".dialog__error");
  assertEqual(error.hidden, false);
  assertEqual(error.textContent, `Subtasks go ${MAX_TASK_DEPTH - 1} levels deep`);
  assertTrue(deep.isConnected, "the dialog stays open with the error");
  deep.querySelector(".dialog__button:not(.dialog__button--ok)").click();
  assertEqual(await refusing, null);
  assertEqual(app.calls.filter(([kind]) => kind === "create"), [], "no request for the 6th level");
  const opened = newTaskDialog(app, tree().get(1), chain[MAX_TASK_DEPTH - 2]);
  const dialog = document.querySelector("dialog");
  assertTrue(dialog, "level 5 can still be added");
  dialog.querySelector(".dialog__button:not(.dialog__button--ok)").click();
  assertEqual(await opened, null);
  assertEqual(app.calls.filter(([kind]) => kind === "create"), []);
});
