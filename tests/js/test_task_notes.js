// A task's notes in the note window (031): the session's saving, the channel's messages, the
// task page's chip and live text, the note window's switches between a task and a note.
import { LivePage } from "../../static/js/live/live-page.js";
import { LiveSender } from "../../static/js/live/live-sender.js";
import { noteHints } from "../../static/js/layout/view-keys.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { TaskNotesLive, LIVE_CHIP, isLiveFor, liveTaskState } from "../../static/js/tasks/task-notes-live.js";
import { TaskNotesMode, TaskNotesSession, notesSavedText, taskClosedMessage, taskLiveMessage, taskNotesCrumbs }
  from "../../static/js/tasks/task-notes-session.js";
import { TaskPage } from "../../static/js/tasks/task-page.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { taskNotesUrl } from "../../static/js/windows/note-window.js";
import { FakeTimers } from "./fakes.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const TREE = () => new NoteTree([{ id: 1, parent_id: null, title: "Acme", kind: "project" },
  { id: 2, parent_id: 1, title: "Kickoff" }]);
const TASK = { id: 7, note_id: 2, parent_id: null, title: "Book van", notes: "Ask *twice*", due: "" };

function fakeChannel() {
  return {
    sent: [],
    handlers: [],
    send(message) {
      this.sent.push(message);
    },
    listen(handler) {
      this.handlers.push(handler);
    },
    deliver(message) {
      for (const handler of this.handlers) handler(message);
    },
  };
}

function fakeTasksApi({ fail = false } = {}) {
  return {
    saves: [],
    update(id, values, options = {}) {
      this.saves.push({ id, ...values, ...options });
      if (fail) return Promise.reject(new Error("Paradigm is not answering"));
      return Promise.resolve({ ...TASK, id, ...values });
    },
  };
}

function makeSession(api = fakeTasksApi()) {
  const timers = new FakeTimers();
  const errors = [];
  const saved = [];
  const session = new TaskNotesSession({ api: { save: (id, notes, options) => api.update(id, { notes }, options) }, timers,
    delayMs: 1000, onError: (error) => errors.push(error.message), onSaved: (task) => saved.push(task.id) });
  session.open(TASK);
  return { api, timers, session, errors, saved };
}

test("task notes session: saves a second after typing stops, as { id, notes }", async () => {
  const { api, timers, session, saved } = makeSession();
  assertEqual(session.text, "Ask *twice*");
  assertTrue(!session.dirty);
  session.edited("Ask *three* times");
  assertTrue(session.dirty);
  timers.advance(999);
  assertEqual(api.saves.length, 0, "not yet");
  timers.advance(1);
  await tick();
  assertEqual(JSON.stringify(api.saves), JSON.stringify([{ id: 7, notes: "Ask *three* times" }]));
  assertTrue(!session.dirty, "saved");
  assertEqual(saved.join(), "7", "the other window is told");
  assertEqual(await session.save(), false, "nothing to save: no request");
  assertEqual(api.saves.length, 1);
});

test("task notes session: a failed save keeps the text and says E: notes not saved", async () => {
  const { api, timers, session, errors } = makeSession(fakeTasksApi({ fail: true }));
  session.edited("new text");
  let thrown = "";
  await session.save().catch((error) => { thrown = error.message; });
  assertEqual(thrown, "E: notes not saved: Paradigm is not answering");
  assertTrue(session.dirty && session.failed, "kept, and marked failed");
  assertEqual(session.text, "new text");
  session.edited("new text!");
  timers.advance(1000);
  await tick();
  assertEqual(errors.at(-1), "E: notes not saved: Paradigm is not answering", "the autosave says so too");
  assertEqual(api.saves.length, 2);
});

test("task notes session: leaving sends what is unsaved with keepalive; empty notes open empty", () => {
  const { api, session } = makeSession();
  session.saveBeforeLeaving();
  assertEqual(api.saves.length, 0, "nothing unsaved: nothing sent");
  session.edited("typed");
  session.saveBeforeLeaving();
  assertEqual(JSON.stringify(api.saves[0]), JSON.stringify({ id: 7, notes: "typed", keepalive: true }));
  session.open({ ...TASK, id: 8, notes: null });
  assertEqual(session.text, "");
  assertTrue(!session.dirty);
  session.close();
  assertTrue(!session.active && session.taskId === null);
});

test("task notes: the crumb, the messages, the status line", () => {
  assertEqual(taskNotesCrumbs(TREE(), TASK).join(" › "), "Task › Acme › Book van", "the project, not the note it is on");
  assertEqual(taskNotesCrumbs(TREE(), { ...TASK, note_id: 1, title: "" }).join(" › "), "Task › Acme › (no text)");
  assertEqual(JSON.stringify(taskLiveMessage(TASK, "hi", { line: 0, col: 2, mode: "insert" })),
    JSON.stringify({ type: "live", task: 7, title: "Book van", text: "hi", caret: { line: 0, col: 2, mode: "insert" } }));
  assertEqual(JSON.stringify(taskClosedMessage(7)), JSON.stringify({ type: "live-closed", task: 7 }));
  assertEqual(notesSavedText(TASK), "\"Book van\" notes saved");
  assertEqual(taskNotesUrl(7), "/note.html?task=7");
  assertEqual(noteHints({ task: true, sheet: true }).map(({ cap }) => cap).join(" "), "@ :w", "no capture keys, no sheet");
});

test("task notes: the chip's state follows the channel", () => {
  let state = null;
  state = liveTaskState(state, { type: "live", task: 7, title: "Book van", text: "x", caret: { line: 0, col: 0, mode: "normal" } });
  assertTrue(isLiveFor(state, 7) && !isLiveFor(state, 8));
  assertEqual(liveTaskState(state, { type: "live-closed", task: 8 }), state, "another task's close: still open");
  assertEqual(liveTaskState(state, { type: "live-ask" }), state);
  assertEqual(liveTaskState(state, { type: "live-closed", task: 7 }), null, "closed");
  assertEqual(liveTaskState(state, { type: "live-closed" }), null, "the note window went");
  assertEqual(liveTaskState(state, { type: "live", id: 3, fields: [] }), null, "a note opened there");
});

function liveCard(channel) {
  const closed = [];
  const live = new TaskNotesLive({ changes: channel, onClosed: (id) => closed.push(id) });
  const card = document.createElement("section");
  const head = document.createElement("header");
  const edit = document.createElement("button");
  edit.className = "task-card__add";
  head.append(edit);
  const body = document.createElement("div");
  body.textContent = "saved notes";
  card.append(head, body);
  document.body.append(card);
  live.attach({ taskId: 7, head, edit, body, render: (markdown) => `<p>${markdown}</p>` });
  return { live, card, head, body, closed };
}

test("task notes: the task page's chip and live text, then the saved notes again", () => {
  const channel = fakeChannel();
  const { live, card, head, body, closed } = liveCard(channel);
  try {
    live.ask();
    assertEqual(channel.sent.at(-1).type, "live-ask");
    assertEqual(head.querySelector(".chip"), null, "not open: no chip");
    channel.deliver({ type: "live", task: 8, title: "Other", text: "x", caret: { line: 0, col: 0, mode: "normal" } });
    assertEqual(head.querySelector(".chip"), null, "another task's notes");
    channel.deliver(taskLiveMessage(TASK, "Hello", { line: 0, col: 2, mode: "insert" }));
    const chip = head.querySelector(".chip");
    assertEqual(chip?.textContent, LIVE_CHIP);
    assertTrue(chip.classList.contains("chip--info") && chip.querySelector(".chip__dot"), "info tone, with its dot");
    assertEqual(chip.nextElementSibling?.className, "task-card__add", "left of Edit");
    assertEqual(body.querySelector(".task-page__notes p")?.textContent, "Hello");
    assertTrue(body.querySelector(".live-caret--bar"), "the caret, a bar in insert mode");
    assertEqual(live.text(7), "Hello");
    channel.deliver(taskLiveMessage(TASK, "", { line: 0, col: 0, mode: "normal" }));
    assertTrue(body.querySelector(".live-caret--empty"), "empty notes: the caret on its own");
    assertEqual(head.querySelectorAll(".chip").length, 1, "one chip");
    channel.deliver(taskClosedMessage(7));
    assertEqual(head.querySelector(".chip"), null, "closed: the chip goes");
    assertEqual(closed.join(), "7", "the page reads the saved notes");
    assertEqual(live.text(7), null);
  } finally {
    card.remove();
  }
});

test("task notes: the Live page leaves a task's messages to the task page", () => {
  const section = document.createElement("section");
  document.body.append(section);
  const channel = fakeChannel();
  const switched = [];
  const app = { tree: TREE(), currentId: 1, markdownOptions: () => ({}), guard: () => {}, fail: () => {} };
  const page = new LivePage(section, { changes: channel, app: () => app, onNewNote: (id) => switched.push(id) });
  try {
    channel.deliver(taskLiveMessage(TASK, "Hello", { line: 0, col: 0, mode: "normal" }));
    channel.deliver(taskClosedMessage(7));
    assertEqual(page.state, null);
    assertTrue(!page.closed);
    assertEqual(switched.length, 0, "never pulls the main window to Live");
  } finally {
    section.remove();
  }
});

test("task notes: the note window's sender carries the task, and live-closed on pagehide", () => {
  const channel = fakeChannel();
  const editor = new EventTarget();
  editor.value = "Hello";
  const taskNotes = { active: true, taskId: 7, liveMessage: (cursor) => taskLiveMessage(TASK, editor.value, cursor) };
  const app = { tree: TREE(), currentId: null, editor, agendaEditor: null, agenda: { id: null }, highlightsOf: () => [],
    events: new EventTarget(), taskNotes };
  let now = 1000;
  const sender = new LiveSender(app, channel, { clock: () => now, timers: { setTimeout: () => 1, clearTimeout: () => {} } });
  const win = new EventTarget();
  sender.listen(win);
  app.events.dispatchEvent(new Event("redraw"));
  assertEqual(JSON.stringify(channel.sent.at(-1)), JSON.stringify(taskLiveMessage(TASK, "Hello", { line: 0, col: 0, mode: "normal" })));
  now += 100;
  editor.dispatchEvent(new CustomEvent("cursor", { detail: { line: 0, col: 3, mode: "insert" } }));
  assertEqual(JSON.stringify(channel.sent.at(-1).caret), JSON.stringify({ line: 0, col: 3, mode: "insert" }));
  channel.deliver({ type: "live-ask" });
  assertEqual(channel.sent.at(-1).task, 7, "an ask is answered with the task's notes");
  assertTrue(channel.sent.at(-1).reply);
  win.dispatchEvent(new Event("pagehide"));
  assertEqual(JSON.stringify(channel.sent.at(-1)), JSON.stringify({ type: "live-closed", task: 7 }));
  taskNotes.active = false;
  win.dispatchEvent(new Event("pagehide"));
  assertEqual(JSON.stringify(channel.sent.at(-1)), JSON.stringify({ type: "live-closed" }), "a note's close, as before");
});

/** Enough of the note window's NotesApp to run openTask and switchTo for real. */
function noteWindow({ api = fakeTasksApi(), noteDirty = false } = {}) {
  const channel = fakeChannel();
  const editor = new EventTarget();
  Object.assign(editor, { value: "the note", readOnly: false, modified: false, focus() {}, showMessage: (text) => said.push(text) });
  const said = [];
  const pushed = [];
  const noteSaves = [];
  const app = {
    role: "note",
    editor,
    changes: channel,
    tree: TREE(),
    tasks: new Tasks([TASK]),
    history: { pushState: (s, t, url) => pushed.push(url), replaceState: (s, t, url) => pushed.push(`replace ${url}`) },
    session: {
      note: { id: 2, title: "Kickoff" },
      dirty: noteDirty,
      close() { this.note = null; this.dirty = false; },
      async save() { noteSaves.push(2); this.dirty = false; },
      open(note) { this.note = note; },
    },
    agenda: { dirty: false, open() {}, save: async () => {} },
    api: { get: async (id) => ({ id, title: "Kickoff", body: "the note" }) },
    redraw() {},
    showSaveState() {},
    say: (text) => said.push(text),
    fail: (error) => said.push(error.message),
    guard: () => {},
    get currentId() { return this.session.note?.id ?? null; },
  };
  for (const name of ["openTask", "switchTo", "saveBeforeSwitching", "saveTaskNotesBeforeClosing", "saveCommand"]) app[name] = NotesApp.prototype[name];
  app.taskNotes = new TaskNotesMode(app, { api, timers: new FakeTimers() });
  return { app, channel, editor, said, pushed, noteSaves, api };
}

test("task notes: the note window opens a task's notes, saving the note first, and :w says so", async () => {
  const { app, channel, editor, said, pushed, noteSaves, api } = noteWindow({ noteDirty: true });
  assertTrue(await app.openTask(7));
  assertEqual(noteSaves.join(), "2", "the note was saved first");
  assertEqual(app.currentId, null, "no note open");
  assertEqual(editor.value, "Ask *twice*", "the editor holds its notes");
  assertEqual(pushed.at(-1), "/note.html?task=7");
  app.taskNotes.edited("Ask *three* times");
  assertTrue(editor.modified);
  await app.saveCommand(false);
  assertEqual(JSON.stringify(api.saves.at(-1)), JSON.stringify({ id: 7, notes: "Ask *three* times" }));
  assertEqual(said.at(-1), "\"Book van\" notes saved");
  assertEqual(JSON.stringify(channel.sent.at(-1)), JSON.stringify({ type: "changed", what: ["tasks"] }), "the main window reads them again");
  assertTrue(!editor.modified);
});

test("task notes: opening a note from them saves them and closes them", async () => {
  const { app, channel, api } = noteWindow();
  await app.openTask(7);
  app.taskNotes.edited("typed");
  assertTrue(await app.switchTo(2, { history: "none", discard: false, heading: "" }));
  assertEqual(api.saves.at(-1).notes, "typed", "saved before leaving");
  assertTrue(!app.taskNotes.active);
  assertEqual(app.currentId, 2);
  assertEqual(JSON.stringify(channel.sent.slice(-2)), JSON.stringify([{ type: "changed", what: ["tasks"] }, { type: "live-closed", task: 7 }]),
    "saved, then let go: the task page reads the saved notes");
});

test("task notes: a failed save keeps them open, with the text", async () => {
  const { app, said, editor } = noteWindow({ api: fakeTasksApi({ fail: true }) });
  await app.openTask(7);
  editor.value = "typed";
  app.taskNotes.edited("typed");
  assertEqual(await app.switchTo(2, { history: "none", discard: false, heading: "" }), false);
  assertEqual(said.at(-1), "E: notes not saved: Paradigm is not answering");
  assertTrue(app.taskNotes.active && app.taskNotes.dirty);
  assertEqual(editor.value, "typed");
});

test("task notes: text typed while the note loads is saved to the task before they close", async () => {
  const { app, api } = noteWindow();
  await app.openTask(7);
  app.taskNotes.edited("typed");
  const get = app.api.get;
  app.api.get = async (id) => {
    app.taskNotes.edited("typed, and more");
    return get(id);
  };
  assertTrue(await app.switchTo(2, { history: "none", discard: false, heading: "" }));
  assertEqual(api.saves.map((each) => each.notes).join("|"), "typed|typed, and more", "the late text is on the task");
  assertTrue(!app.taskNotes.active);
  assertEqual(app.currentId, 2);
});

test("task notes: a failed save of what was typed during the load stops the switch", async () => {
  const api = fakeTasksApi();
  const { app, said, editor } = noteWindow({ api });
  await app.openTask(7);
  app.api.get = async (id) => {
    api.update = () => Promise.reject(new Error("Paradigm is not answering"));
    editor.value = "typed late";
    app.taskNotes.edited("typed late");
    return { id, title: "Kickoff", body: "the note" };
  };
  assertEqual(await app.switchTo(2, { history: "none", discard: false, heading: "" }), false);
  assertEqual(said.at(-1), "E: notes not saved: Paradigm is not answering");
  assertTrue(app.taskNotes.active && app.taskNotes.dirty, "the task's notes stay open");
  assertEqual(editor.value, "typed late");
  assertEqual(app.currentId, null, "the note did not open");
});

test("task notes: the task page asks once, shows the chip in its Notes card, and reads the notes again on close", async () => {
  const channel = fakeChannel();
  const section = document.createElement("section");
  document.body.append(section);
  let refreshed = 0;
  const full = { ...TASK, note_id: 1, delegate_id: null, follow_up: "", done: false, done_day: "", position: 1,
    estimate_min: null, for_person_id: null };
  const ctx = { tree: TREE(), tasks: new Tasks([full]), trash: { entries: [] }, taskId: 7, today: new Date(2026, 10, 25, 9) };
  const app = { tasks: ctx.tasks, tree: ctx.tree, guard: (promise) => promise?.catch?.(() => {}), markdownOptions: () => ({}),
    say() {}, focusNote() {}, changes: channel, refreshTree: async () => { refreshed += 1; } };
  const page = new TaskPage(section, { app: () => app, onLeave() {}, changes: channel });
  try {
    page.show(ctx);
    assertEqual(channel.sent.filter((message) => message.type === "live-ask").length, 1, "asked as it opened");
    page.show(ctx);
    assertEqual(channel.sent.filter((message) => message.type === "live-ask").length, 1, "a redraw does not ask again");
    channel.deliver(taskLiveMessage(full, "Typed **now**", { line: 0, col: 1, mode: "normal" }));
    const head = section.querySelector(".task-card--notes .task-card__head");
    assertEqual(head.querySelector(".task-notes__live")?.textContent, LIVE_CHIP);
    assertEqual(section.querySelector(".task-card--notes .task-page__notes strong")?.textContent, "now", "rendered as typed");
    assertTrue(section.querySelector(".task-card--notes .live-caret--block"), "a block caret in normal mode");
    page.show(ctx);
    assertTrue(section.querySelector(".task-card--notes .task-notes__live"), "a redraw keeps the chip and the live text");
    assertEqual(section.querySelector(".task-card--notes .task-page__notes strong")?.textContent, "now");
    channel.deliver(taskClosedMessage(7));
    assertEqual(section.querySelector(".task-notes__live"), null);
    assertEqual(refreshed, 1, "the saved notes are read again");
  } finally {
    section.remove();
  }
});
