// The task page (static/js/tasks/task-page.js and its parts): its rows (taskTree), J/K's
// target, its key table, the head's chips, the facts row and Next block (task-page-model.js),
// the side column's cards and their order, Files and History with fake APIs, s,
// the gone states, and the page drawn with a fake app. Also the section's Enter (the task page)
// and z (in place), and the delete confirm's count.
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { newTaskDialog, removeTaskText } from "../../static/js/tasks/task-commands.js";
import { TASK_PAGE_KEYS, taskPageAction } from "../../static/js/tasks/task-page-keys.js";
import { TaskPage, goneReason } from "../../static/js/tasks/task-page.js";
import { MAX_TASK_DEPTH, Tasks, moveTarget, taskTree } from "../../static/js/tasks/tasks-model.js";
import { SIDE_CARDS, dueChip, fileDetail, freeSlotFor, headChips, historyRows, nextBlockText, noSlotText, placedText,
  shortDay, sourceOf, subtaskCount, taskFacts, toAnswerText } from "../../static/js/tasks/task-page-model.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
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
  assertEqual(["j", "ArrowDown", "k", "ArrowUp", "G", "Enter", "a", " ", "e", "E", "d", "s", "x", "Delete", "J", "K", "Escape"].map(key),
    ["next", "next", "previous", "previous", "last", "open", "add", "toggle", "editNotes", "edit", "delegate", "schedule", "remove", "remove", "moveDown", "moveUp", "leave"]);
  assertEqual(["h", "ArrowLeft", "l", "ArrowRight"].map(key), ["previousColumn", "previousColumn", "nextColumn", "nextColumn"]);
  assertEqual([key("g"), key("g")], ["pending", "first"]);
  assertEqual(taskPageAction(new KeyboardEvent("keydown", { key: "j", ctrlKey: true })), null);
  assertTrue(TASK_PAGE_KEYS.every((entry) => entry.help), "every key has its help");
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
const selected = (section) => section.querySelector("[aria-selected=true] .task-page__title, [aria-selected=true] .task-sub__title")?.textContent;

test("task page: breadcrumb, head, Notes the main column, the side column's cards in order", () => withPage(({ section, app }) => {
  const crumbs = [...section.querySelectorAll(".task-page__crumbs button, .task-page__crumb-here")].map((n) => n.textContent);
  assertEqual(crumbs, ["Move", "Book van"]);
  assertEqual(section.querySelector(".task-page__head .task-page__title").textContent, "Book van");
  assertEqual([...section.querySelectorAll(".task-page__buttons button")].map((n) => n.dataset.action),
    ["toggleTask", "scheduleTask", "delegateTask", "editTask", "moreTask"]);
  assertEqual([...section.querySelectorAll(".task-page__buttons .key")].map((n) => n.textContent), ["Space", "s", "d", "E"]);
  assertEqual(section.querySelector(".task-page__buttons [data-action=editTask]").firstChild.textContent, "Edit…", "Edit… opens the dialog");
  const notesEdit = section.querySelector(".task-card--notes .task-card__add");
  assertEqual(`${notesEdit.dataset.action} ${notesEdit.querySelector(".key").textContent}`, "editNotes e", "the Notes card's Edit e: the note window");
  assertEqual([...section.querySelectorAll(".task-page__fact-label")].map((n) => n.textContent), ["Project", "For", "Delegated to", "Next block"]);
  const columns = section.querySelector(".task-page__columns");
  assertTrue(columns.children[0].classList.contains("task-card--notes"), "Notes first, the main column");
  assertTrue(columns.querySelector(".task-card--notes .task-page__notes strong")?.textContent === "twice", "its notes, rendered");
  assertEqual([...columns.children[1].children].map((n) => [...n.classList].find((c) => c.startsWith("task-card--"))),
    ["task-card--subtasks", "task-card--emails", "task-card--files", "task-card--history"], "no From card without a source");
  assertEqual(section.querySelector(".task-card--subtasks .task-card__count").textContent, "1 of 4 done");
  const rows = [...section.querySelectorAll(".task-sub__row")];
  assertEqual(rows.map((row) => row.querySelector(".task-sub__title").textContent), ["Get quotes", "Call movers", "Ask Jo", "Pick a date"]);
  assertEqual(rows.map((row) => [...row.classList].find((c) => c.startsWith("task-sub__row--depth-"))),
    ["task-sub__row--depth-1", "task-sub__row--depth-2", "task-sub__row--depth-2", "task-sub__row--depth-1"]);
  assertEqual(rows.map((row) => row.querySelector(".task-sub__detail")?.textContent ?? ""), ["", "→ Priya Shah · follow up Fri", "", "done Fri 20 Nov"]);
  assertEqual(section.querySelectorAll(".task-sub__row .md-doc").length, 0, "no Subtask | Notes table: a subtask's notes are on its page");
  assertTrue(rows[3].classList.contains("task-sub__row--done"), "a done one stays in place, struck through");
  assertTrue(section.querySelector("[data-action=addDirect]"), "+ Subtask");
  assertEqual(section.querySelector(".task-card--files .task-card__hint").textContent, "Add file… opens the file picker in the project's OneDrive folder");
  section.querySelector(".task-page__crumbs button").click();
  assertEqual(app.calls.at(-1), ["open", 1], "the hub opens its dashboard");
  section.querySelector(".task-page__fact--hub button").click();
  assertEqual(app.calls.at(-1), ["open", 1], "so does the facts row's project");
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

// task-page.css's two columns, which the test page does not load.
const sideBySide = (section) => Object.assign(section.querySelector(".task-page__columns").style,
  { display: "grid", gridTemplateColumns: "400px 250px", alignItems: "start" });

test("task page: l from the task (over its Notes) to the side column, h back; no wrap", () => withPage(({ section }) => {
  sideBySide(section);
  assertEqual(selected(section), "Book van");
  press(section, "h");
  assertEqual(selected(section), "Book van", "h in the left column does nothing");
  press(section, "l");
  assertEqual(selected(section), "Get quotes", "the side column's row nearest in height");
  press(section, "l");
  assertEqual(selected(section), "Get quotes", "l in the last column does nothing");
  press(section, "G");
  press(section, "h");
  assertEqual(selected(section), "Book van", "back to the task");
  press(section, "ArrowRight");
  assertEqual(selected(section), "Get quotes", "→ as l");
  press(section, "ArrowLeft");
  assertEqual(selected(section), "Book van", "← as h");
}));

test("task page: under 1000 px the side column stacks under the Notes; h and l do nothing there", () => withPage(({ section }) => {
  Object.assign(section.querySelector(".task-page__columns").style, { display: "grid", gridTemplateColumns: "minmax(0, 1fr)" });
  assertEqual(selected(section), "Book van");
  press(section, "l");
  assertEqual(selected(section), "Book van", "l does not drop to the side column's cards below");
  press(section, "G");
  const last = selected(section);
  press(section, "h");
  assertEqual(selected(section), last, "h does not climb back to the head");
  press(section, "ArrowLeft");
  assertEqual(selected(section), last, "← neither");
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
    assertEqual(section.querySelector(".task-page__no-notes").textContent, "No notes yet. e to write them.");
    assertEqual(section.querySelectorAll(".task-sub__row").length, 0);
    assertTrue(section.querySelector("[data-action=addDirect]"));
  }, { taskId: 20 });
  withPage(({ section, app }) => {
    assertEqual(section.querySelector("[data-action=addDirect]"), null, "no Add");
    assertEqual(section.querySelectorAll(".task-page__buttons").length, 0, "no head buttons");
    assertTrue(section.querySelector(".task-page__head .chip").textContent.includes("read-only"));
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

// The page's words (task-page-model.js). TODAY_AT: Thu 26 Nov 2026, 09:00.
const TODAY_AT = new Date(2026, 10, 26, 9, 0);
const session = (id, taskId, day, start, end) => ({ id, task_id: taskId, day, start, end });
const SETTINGS = { settings: { day_start: "08:00", day_end: "17:00" }, upcoming: [] };

test("task page model: short days, the due chip", () => {
  assertEqual([shortDay("2026-11-27", TODAY_AT), shortDay("2026-11-20", TODAY_AT), shortDay("2026-12-02", TODAY_AT), shortDay("2026-12-03", TODAY_AT)],
    ["Fri", "Fri", "Wed", "Thu 3 Dec"]);
  const due = (day, more = {}) => dueChip(task(1, "a", { due: day, ...more }), TODAY_AT);
  assertEqual(due("2026-11-24"), { text: "2 d late · was due Tue 24 Nov", tone: "danger" });
  assertEqual(due("2026-11-26"), { text: "Due today", tone: "caution" });
  assertEqual(due("2026-11-27"), { text: "Due tomorrow", tone: "caution" });
  assertEqual(due("2026-11-28"), { text: "Due Sat", tone: "caution" });
  assertEqual(due("2026-12-04"), { text: "Due Fri 4 Dec", tone: "neutral" });
  assertEqual(due(""), null);
  assertEqual(due("2026-11-24", { done: true }), null, "done: no longer late");
});

test("task page model: the head's chips: late, estimate, each block placed", () => {
  const ctx = { tree: tree(), tasks: tasks(), sessions: [session(2, 10, "2026-11-26", "10:00", "11:00"), session(1, 10, "2026-11-23", "10:00", "12:00"),
    session(3, 11, "2026-11-26", "13:00", "14:00")] };
  const chips = headChips(ctx, task(10, "Book van", { due: "2026-11-24", estimate_min: 120 }), TODAY_AT);
  assertEqual(chips.map((each) => `${each.tone}:${each.text}`),
    ["danger:2 d late · was due Tue 24 Nov", "neutral:2 h estimate", "success:2 h placed Mon · done", "success:1 h placed Thu"]);
});

test("task page model: the facts row and Next block", () => {
  const ctx = { tree: tree(), tasks: tasks(), meetings: new Meetings(), timeSettings: SETTINGS,
    sessions: [session(1, 10, "2026-11-30", "10:00", "12:00"), session(2, 10, "2026-11-25", "10:00", "11:00")] };
  const facts = taskFacts(ctx, tasks().get(10), TODAY_AT);
  assertEqual(facts.map((fact) => `${fact.label}=${fact.text}`), ["Project=Move", "For=—", "Delegated to=—", "Next block=Mon 30 Nov 10:00–12:00"]);
  assertEqual(facts[0].noteId, 1);
  const delegated = taskFacts(ctx, { ...tasks().get(12), for_person_id: 3 }, TODAY_AT);
  assertEqual(delegated.slice(1).map((fact) => fact.text).slice(0, 2), ["Priya Shah", "Priya Shah · follow up Fri"]);
  assertEqual(nextBlockText({ ...ctx, sessions: [] }, tasks().get(10), TODAY_AT), "None · s finds Thu 09:00", "the slot s would take, from now");
  assertEqual(nextBlockText({ ...ctx, sessions: [] }, tasks().get(13), TODAY_AT), "None", "done: nothing to find");
  const full = { ...ctx, sessions: [session(9, 14, "2026-11-26", "08:00", "17:00")] };
  assertEqual(nextBlockText(full, task(10, "a", { due: "2026-11-26" }), TODAY_AT), "None", "no room before it is due");
  assertEqual(freeSlotFor(full, task(10, "a", { due: "2026-11-27" }), TODAY_AT).slot, { day: "2026-11-27", start: 480, end: 510 });
  assertEqual(placedText({ title: "Book van" }, { day: "2026-11-30", start: 600, end: 630 }, TODAY_AT), '"Book van" placed Mon 30 Nov 10:00–10:30');
  assertEqual(noSlotText(30, "2026-11-30"), "No free 30 min before it is due");
});

test("task page model: subtasks, emails, files, the source, history, Live", () => {
  assertEqual(subtaskCount([{ done: true }, { done: false }]), "1 of 2 done");
  assertEqual(toAnswerText([{ reply: "needed" }, { reply: "replied" }, { reply: "needed" }]), "2 to answer");
  assertEqual(toAnswerText([{ reply: "none" }]), "");
  const file = { id: 3, name: "Spec.xlsx", folder_name: "Customer portal", hub_id: 5, hub_title: "Customer portal v2" };
  assertEqual(fileDetail(file, 5), "OneDrive · Customer portal");
  assertEqual(fileDetail({ ...file, folder_name: "Shared", hub_title: "Ben Ortiz" }, 1), "OneDrive · Shared · from Ben Ortiz");
  const notes = new NoteTree([...NOTES, { id: 7, parent_id: 1, title: "2026-11-25 Portal review", kind: "meeting" }, { id: 8, parent_id: 1, title: "Scratch" }]);
  const ctx = { tree: notes, meetings: new Meetings([{ id: 7, day: "2026-11-25", time: "10:00", attendees: [] }]), today: TODAY_AT };
  assertEqual(sourceOf(ctx, task(1, "a", { source_id: 7, quote: "T: book the van" })),
    { noteId: 7, title: "Portal review", day: "2026-11-25", when: "Wed 25 Nov", chip: "From a meeting", tone: "meeting", quote: "T: book the van" });
  assertEqual(sourceOf(ctx, task(1, "a", { source_id: 8, quote: "x" })).chip, "From a note");
  assertEqual(sourceOf(ctx, task(1, "a")), null, "no source, no card");
  assertEqual(historyRows([{ day: "2026-11-25", time: "10:00", kind: "captured", text: "Captured in Portal review", note_id: 7 }], TODAY_AT),
    [{ key: "event-0", day: "Wed 25 Nov", text: "Captured in Portal review", noteId: 7 }]);
  assertEqual(historyRows([{ day: null, time: null, kind: "delegated", text: "Delegated to Ben Ortiz", note_id: 2, follow_up: "2026-12-04" },
    { day: null, time: null, kind: "delegated", text: "Delegated to Ben Ortiz", note_id: 2, follow_up: null }], TODAY_AT),
    [{ key: "event-0", day: "", text: "Delegated to Ben Ortiz · follow up Fri 4 Dec", noteId: 2 },
      { key: "event-1", day: "", text: "Delegated to Ben Ortiz", noteId: 2 }], "the follow-up day is worded here; none, no suffix");
  assertEqual(SIDE_CARDS, ["subtasks", "emails", "files", "source", "history"]);
});

function fakeTaskApi(calls, { files = [], events = [] } = {}) {
  let rows = files.map((each) => ({ ...each }));
  return {
    files: async (id) => {
      calls.push(["files", id]);
      return rows.map((each) => ({ ...each }));
    },
    detachFile: async (taskId, fileId) => {
      calls.push(["detachFile", taskId, fileId]);
      rows = rows.filter((each) => each.id !== fileId);
      return {};
    },
    history: async (id) => {
      calls.push(["history", id]);
      return events;
    },
    addSession: async (...args) => calls.push(["addSession", ...args]),
  };
}

async function withFullPage(body, { files = [], events = [], list = TASKS, taskId = 10, sessions = [] } = {}) {
  const section = document.createElement("section");
  document.body.append(section);
  const notes = new NoteTree([...NOTES, { id: 7, parent_id: 1, title: "2026-11-25 Portal review", kind: "meeting" }]);
  const ctx = { tree: notes, tasks: new Tasks(list), trash: { entries: [] }, taskId, today: TODAY_AT, sessions,
    meetings: new Meetings([{ id: 7, day: "2026-11-25", time: "10:00", attendees: [] }]), timeSettings: SETTINGS };
  const app = fakeApp(ctx);
  Object.assign(app.tasksApi, fakeTaskApi(app.calls, { files, events }));
  Object.assign(app, { today: () => TODAY_AT, meetings: ctx.meetings, sessions, timeSettings: SETTINGS,
    filesApi: { open: async (id) => app.calls.push(["openFile", id]) } });
  const page = new TaskPage(section, { app: () => app, onLeave() {} });
  try {
    page.show(ctx);
    await tick();
    return await body({ page, section, app, ctx });
  } finally {
    section.remove();
  }
}

const FILE = { id: 3, name: "Request form fields v3.xlsx", rel_path: "Specs/Request form fields v3.xlsx", folder_id: 1, folder_name: "Customer portal",
  hub_id: 1, hub_title: "Move", missing: false, added_at: "2026-11-25T10:00:00" };
const EVENTS = [
  { day: null, time: null, kind: "delegated", text: "Delegated to Priya Shah", note_id: null, follow_up: "2026-11-27" },
  { day: "2026-11-25", time: "10:00", kind: "captured", text: "Captured in Portal review", note_id: 7 },
];

test("task page: Files lists the task's files; Enter opens one, x unlinks it", () => withFullPage(async ({ section, app }) => {
  assertEqual(app.calls.filter(([kind]) => kind === "files"), [["files", 10]]);
  assertEqual(section.querySelector(".task-card--files .task-card__count").textContent, "1");
  assertEqual(section.querySelector(".task-files__name").textContent, FILE.name);
  assertEqual(section.querySelector(".task-files__where").textContent, "OneDrive · Customer portal");
  press(section, "G");
  press(section, "k");
  press(section, "k");
  assertTrue(section.querySelector("[aria-selected=true] .task-files__name"), "the file row, before History's two");
  press(section, "Enter");
  await tick();
  assertEqual(app.calls.at(-1)[0] === "say" ? app.calls.at(-2) : app.calls.at(-1), ["openFile", 3]);
  press(section, "x");
  await tick();
  assertEqual(app.calls.filter(([kind]) => kind === "detachFile"), [["detachFile", 10, 3]]);
  assertEqual(section.querySelectorAll(".task-files__row").length, 0, "the row goes");
  assertTrue(app.calls.some(([kind, text]) => kind === "say" && text.includes("stays in OneDrive")));
}, { files: [FILE], events: EVENTS }));

test("task page: From a meeting and History; Enter on them opens the note", () => withFullPage(async ({ section, app }) => {
  const side = [...section.querySelector(".task-page__side").children].map((n) => [...n.classList].find((c) => c.startsWith("task-card--")));
  assertEqual(side, ["task-card--subtasks", "task-card--emails", "task-card--files", "task-card--source", "task-card--history"]);
  assertEqual(section.querySelector(".task-card--source .chip").textContent, "From a meeting");
  assertEqual(section.querySelector(".task-source__title").textContent, "Portal review · Wed 25 Nov");
  assertEqual(section.querySelector(".task-source__quote").textContent, "T: book the van");
  assertEqual([...section.querySelectorAll(".task-history__row")].map((row) => row.textContent),
    ["Delegated to Priya Shah · follow up Fri", "Wed 25 NovCaptured in Portal review"]);
  press(section, "G");
  press(section, "Enter");
  await tick();
  assertEqual(app.calls.at(-1), ["open", 7]);
  press(section, "k");
  press(section, "Enter");
  press(section, "x");
  await tick();
  assertEqual(app.calls.filter(([kind]) => kind === "open").length, 1, "a history line without a note opens nothing; x does nothing there");
  press(section, "k");
  press(section, "Enter");
  await tick();
  assertEqual(app.calls.at(-1), ["open", 7], "the source's row");
}, { events: EVENTS, list: TASKS.map((each) => (each.id === 10 ? { ...each, source_id: 7, quote: "T: book the van" } : each)) }));

test("task page: s puts a block in the first free slot and says where", () => withFullPage(async ({ section, app }) => {
  press(section, "s");
  await tick();
  assertEqual(app.calls.find(([kind]) => kind === "addSession"), ["addSession", 20, "2026-11-26", "09:00", "09:30"]);
  assertEqual(app.calls.filter(([kind]) => kind === "say").at(-1), ["say", '"Tape" placed Thu 26 Nov 09:00–09:30']);
  section.querySelector("[data-action=scheduleTask]").click();
  await tick();
  assertEqual(app.calls.filter(([kind]) => kind === "addSession").length, 2, "the button does the same");
}, { taskId: 20 }));

