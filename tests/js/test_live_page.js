// The Live page (static/js/live/live-page.js) on a page: the caret, the band, the lines it shows
// for no note, a closed note window, a trashed or empty note; and the sender's message.
import { CARET } from "../../static/js/live/caret.js";
import { LivePage, swapCaret } from "../../static/js/live/live-page.js";
import { LiveSender } from "../../static/js/live/live-sender.js";
import { runNoteCommand } from "../../static/js/notes/commands.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { followNoteLinks } from "../../static/js/ui/rendered-text.js";
import { assertEqual, assertTrue, test } from "./harness.js";

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

function fakeApp() {
  return {
    opened: [],
    tree: new NoteTree([{ id: 1, parent_id: null, title: "Acme", kind: "project" }]),
    currentId: 1,
    markdownOptions: () => ({ resolveWikiLink: () => ({ href: "/?note=1", exists: true }) }),
    guard: () => {},
    open(id) {
      this.opened.push(id);
      return Promise.resolve(true);
    },
    fail: () => {},
  };
}

function withPage(body) {
  const section = document.createElement("section");
  document.body.append(section);
  const channel = fakeChannel();
  const app = fakeApp();
  const switched = [];
  const page = new LivePage(section, { changes: channel, app: () => app, onNewNote: (id) => switched.push(id) });
  try {
    body({ page, section, channel, app, switched });
  } finally {
    section.remove();
  }
}

const live = (text, extra = {}) => ({ type: "live", id: 1, title: "Kickoff", kind: "", crumbs: ["Projects", "Acme"],
  fields: [{ name: "body", label: "Notes", text, highlights: [] }], active: "body", line: 0, col: 0, mode: "insert",
  trashed: false, ...extra });

const allAttributes = (root) => [root, ...root.querySelectorAll("*")].flatMap((node) => [...node.attributes].map((a) => a.value));

test("live page: asks the note window on start; no note open shows its line and button", () => withPage(({ section, channel }) => {
  assertEqual(channel.sent[0]?.type, "live-ask");
  assertTrue(section.textContent.includes("No note open in the note window."));
  assertTrue(section.querySelector(".live__open") !== null);
}));

test("live page: the text renders under its path and title, with the caret bar where it is typed", () => withPage(({ page, section }) => {
  page.receive(live("# Plan\n\nabc", { line: 2, col: 3 }));
  assertEqual(section.querySelector(".live__title").textContent, "Kickoff");
  assertEqual(section.querySelector(".live__crumbs").textContent, "Projects › Acme");
  assertTrue(section.querySelector(".live-field h1") !== null);
  const caret = section.querySelector(".live-caret--bar");
  assertTrue(caret !== null, "a bar in insert mode");
  assertEqual(caret.previousSibling.textContent, "abc", "after the c");
  assertTrue(!section.textContent.includes(CARET));
}));

test("live page: a block caret covers its character, and the band is on the cursor's block", () => withPage(({ page, section }) => {
  page.receive(live("one\n\ntwo\n\nthree", { line: 2, col: 0, mode: "normal" }));
  const blocks = [...section.querySelectorAll(".live-block")];
  assertEqual(blocks.map((block) => block.classList.contains("live-block--cursor")).join(), "false,true,false");
  assertEqual(section.querySelector(".live-caret--block").textContent, "t");
  assertEqual(blocks[1].textContent, "two", "no character lost or added");
  page.receive(live("one\n\ntwo\n\nthree", { line: 4, col: 0, mode: "normal" }));
  const moved = [...section.querySelectorAll(".live-block")];
  assertTrue(moved[0] === blocks[0], "an unchanged block keeps its node");
  assertEqual(moved.map((block) => block.classList.contains("live-block--cursor")).join(), "false,false,true");
}));

test("live page: a block caret on a link's [ stays inside the link, which keeps its text", () => withPage(({ page, section }) => {
  page.receive(live("See [x](https://example.invalid/a) and **bold** link.", { line: 0, col: 4, mode: "normal" }));
  const link = section.querySelector(".live-block a");
  assertEqual(link.textContent, "x", "the link keeps its text");
  assertTrue(link.querySelector(".live-caret--block") !== null, "the caret is inside the link");
  assertEqual(section.querySelector(".live-block").textContent, "See x and bold link.");
  page.receive(live("See [x](https://example.invalid/a) and **bold** link.", { line: 0, col: 41, mode: "normal" }));
  const bold = section.querySelector(".live-block strong");
  assertEqual(bold.textContent, "bold");
  assertEqual(bold.querySelector(".live-caret--block")?.textContent, "b", "the caret covers b inside the bold");
}));

test("live page: the cursor on a blank line no block holds gets its own line with the band and caret", () => withPage(({ page, section }) => {
  page.receive(live("- first\n- second\n", { line: 2, col: 0, mode: "insert" }));
  const gap = section.querySelector(".live-gap");
  assertTrue(gap !== null, "a line after the list");
  assertTrue(gap.classList.contains("live-block--cursor") && gap.querySelector(".live-caret--bar") !== null);
  assertTrue(gap.previousElementSibling?.querySelector("ul") !== null, "after the list");
  page.receive(live("one\n\ntwo", { line: 1, col: 0, mode: "normal" }));
  const blocks = [...section.querySelectorAll(".live-block")];
  assertEqual(blocks.map((block) => block.classList.contains("live-gap")).join(), "false,true,false", "between the paragraphs");
  assertEqual(section.querySelectorAll(".live-block--cursor").length, 1);
  page.receive(live("one\n\ntwo", { line: 2, col: 0, mode: "normal" }));
  assertEqual(section.querySelectorAll(".live-gap").length, 0, "gone once the cursor is in a block");
}));

test("live page: the sentinel is never in an href, an id or a src", () => withPage(({ page, section }) => {
  const text = "# Ti tle\n\n[docs](https://x.test/a) [[Acme]] ![pic](/files/a.png)";
  for (let col = 0; col <= text.split("\n")[2].length; col += 1) {
    page.receive(live(text, { line: 2, col }));
    for (const value of allAttributes(section)) {
      assertTrue(!value.includes(CARET) && !/%EE%80%80/i.test(value), `col ${col}: ${value}`);
    }
    assertEqual(section.querySelector("a[href^='https']").getAttribute("href"), "https://x.test/a");
  }
  page.receive(live(text, { line: 0, col: 4 }));
  assertTrue(section.querySelector(".live-field h1").id.startsWith("live-"), "ids apart from the dashboard's");
  assertTrue(!section.querySelector(".live-field h1").id.includes(CARET));
  const node = document.createElement("div");
  node.innerHTML = `<a href="/x%ee%80%80y" title="a${CARET}b">a${CARET}b</a>`;
  const caret = swapCaret(node, "bar");
  assertEqual(node.querySelector("a").getAttribute("href"), "/xy");
  assertEqual(node.querySelector("a").title, "ab");
  assertTrue(caret.parentElement === node.querySelector("a"));
}));

test("live page: empty, trashed and closed say so; the last view stays when closed", () => withPage(({ page, section }) => {
  page.receive(live("  "));
  assertEqual(section.querySelector(".live__note:not([hidden])").textContent, "Empty note");
  page.receive(live("text"));
  page.receive({ type: "live-closed" });
  assertTrue(!section.querySelector(".live__state").hidden);
  assertEqual(section.querySelector(".live__state").textContent, "The note window is closed");
  assertTrue(section.querySelector(".live-field").textContent.includes("text"), "the last view stays");
  page.receive(live("text", { trashed: true, fields: [] }));
  assertEqual(section.querySelector(".live__note:not([hidden])").textContent, "Moved to trash");
  assertTrue(section.querySelector(".live__state").hidden, "a message means the window is open again");
}));

test("live page: a meeting's Agenda, then Notes, the caret in the one being typed in", () => withPage(({ page, section }) => {
  page.receive(live("", { fields: [{ name: "agenda", label: "Agenda", text: "- budget" }, { name: "body", label: "Notes", text: "went well" }],
    active: "agenda", line: 0, col: 3 }));
  const fields = [...section.querySelectorAll(".live-field")];
  assertEqual(fields.map((field) => field.querySelector(".live-field__label").textContent).join(), "Agenda,Notes");
  assertTrue(fields[0].querySelector(".live-caret") !== null);
  assertEqual(fields[1].querySelector(".live-caret"), null);
}));

test("live page: a capture badge opens its record; a new note switches the page, the ask's answer doesn't", () => withPage(({ page, section, app, switched }) => {
  const highlights = [{ text: "Ship it", label: "Decision", title: "Decision: Ship it", data: 9, capture: "decision", meta: "" }];
  page.receive(live("Ship it", { fields: [{ name: "body", label: "Notes", text: "Ship it", highlights }], col: 0, mode: "normal", reply: true }));
  assertEqual(switched.length, 0, "the answer to live-ask");
  const badge = section.querySelector("[data-badge]");
  assertEqual(badge.textContent, "Decision");
  badge.click();
  assertEqual(app.opened.join(), "9");
  page.receive(live("x", { id: 2 }));
  assertEqual(switched.join(), "2");
  page.receive(live("xy", { id: 2 }));
  assertEqual(switched.join(), "2", "typing never switches");
}));

test("live page: a captured line keeps its text, its chip after it; the block caret covers its characters", () => withPage(({ page, section }) => {
  const text = "Discussed the rollout.\nUse the Acme vendor";
  const highlights = [{ text: "Use the Acme vendor", label: "Decision", title: "", data: 9, capture: "decision" }];
  const at = (col) => live(text, { fields: [{ name: "body", label: "Notes", text, highlights }], line: 1, col, mode: "normal" });
  page.receive(at(text.split("\n")[1].length - 1));
  let caret = section.querySelector(".live-caret--block");
  assertEqual(caret.textContent, "r", "on the last r");
  assertTrue(!caret.classList.contains("live-caret--empty"));
  const badge = section.querySelector("[data-badge]");
  assertEqual(badge.textContent, "Decision");
  assertTrue(badge.compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_PRECEDING, "the chip is after the line");
  page.receive(at(0));
  caret = section.querySelector(".live-caret--block");
  assertEqual(caret.textContent, "U", "on the U");
  assertTrue(caret.closest(".pd-highlight") !== null);
  assertTrue(section.textContent.replace(/\s+/g, " ").includes("Use the Acme vendorDecision"), "no character lost, the chip after");
}));

test("live page: a capture's chip goes after the line it equals, never inside a longer line", () => withPage(({ page, section }) => {
  const text = "Ben to check the load-test numbers\ncheck the\nAfter";
  const highlights = [
    { text: "check the", label: "Task", title: "", data: 1, capture: "task" },
    { text: "Ben to check the load-test numbers", label: "Task → Ben · Mon", title: "", data: 2, capture: "task" },
    { text: "the load", label: "Task", title: "", data: 3, capture: "task" },
  ];
  page.receive(live(text, { fields: [{ name: "body", label: "Notes", text, highlights }], line: 2, col: 0, mode: "normal" }));
  const badges = [...section.querySelectorAll("[data-badge]")];
  assertEqual(badges.map((badge) => badge.textContent).join("|"), "Task → Ben · Mon|Task", "in line order, no chip for part of a line");
  const marks = [...section.querySelectorAll(".pd-highlight")].map((mark) => mark.textContent.replace(/\s+/g, " "));
  assertEqual(marks.join("|"), "Ben to check the load-test numbers|check the");
}));

test("live page: captures on one line share its mark, a chip each after it in their order", () => withPage(({ page, section }) => {
  const text = "Intro\nBen to check the numbers and ship Monday";
  const line = "Ben to check the numbers and ship Monday";
  const highlights = [
    { text: line, label: "Decision", title: "", data: 9, capture: "decision" },
    { text: line, label: "Task → Ben · Mon", title: "", data: null, capture: "task" },
  ];
  page.receive(live(text, { fields: [{ name: "body", label: "Notes", text, highlights }], line: 0, col: 0, mode: "normal" }));
  assertEqual(section.querySelectorAll(".pd-highlight").length, 1, "one mark");
  const badges = [...section.querySelectorAll("[data-badge]")];
  assertEqual(badges.map((badge) => `${badge.textContent}:${badge.dataset.highlight}`).join("|"), "Decision:0|Task → Ben · Mon:1");
  assertTrue(section.textContent.replace(/\s+/g, " ").includes(`${line}DecisionTask → Ben · Mon`), "both after the line");
}));

test("live page: an old T: line is plain text; a meeting shows Agreed in this meeting beside its notes", () => withPage(({ page, section, app }) => {
  const shown = [];
  app.showTask = (id) => {
    shown.push(id);
    return Promise.resolve();
  };
  app.today = () => new Date(2026, 10, 27);
  page.receive(live("T: old style", { kind: "" }));
  assertTrue(section.textContent.includes("T: old style"));
  assertTrue(section.querySelector(".live-agreed").hidden, "no card on a note that isn't a meeting");
  const captures = [
    { kind: "task", id: 41, title: "Check the numbers", quote: "Ben to check", hub_id: 1, hub_title: "Team", person_id: 5,
      person_name: "Ben Ortiz", role: "delegate", follow_up: "2026-11-30", due: null, open: true },
    { kind: "question", id: 9, title: "Who owns it?", quote: "Who owns it?", hub_id: 1, hub_title: "Customer portal v2",
      person_id: null, person_name: null, role: null, follow_up: null, due: null, open: true },
  ];
  page.receive(live("Ben to check", { kind: "meeting", captures }));
  const card = section.querySelector(".live-agreed");
  assertTrue(!card.hidden && section.querySelector(".live__body--meeting") !== null);
  assertEqual(card.querySelector(".live-agreed__head").textContent, "Agreed in this meeting 2");
  assertEqual([...card.querySelectorAll(".live-agreed__row")].map((row) => row.textContent).join(" / "),
    "TaskCheck the numbersBen Ortiz · follow up Mon 30 Nov / QuestionWho owns it?open · in Customer portal v2");
  assertEqual(card.querySelector(".live-agreed__foot").textContent, "Everyone sees what was agreed as you capture it.");
  card.querySelectorAll(".live-agreed__row")[0].click();
  card.querySelectorAll(".live-agreed__row")[1].click();
  assertEqual(`${shown.join()}|${app.opened.join()}`, "41|9", "a task's page; a question's note");
  page.receive(live("Ben to check", { kind: "meeting", captures: captures.slice(0, 1) }));
  assertEqual(card.querySelectorAll(".live-agreed__row").length, 1, "it follows the captures as they come");
}));

test("live sender: one message per 50 ms at most; answers live-ask; holds after a trash", () => {
  const channel = fakeChannel();
  let now = 1000;
  const pending = [];
  const timers = { setTimeout: (fn) => pending.push(fn) && pending.length, clearTimeout: () => pending.splice(0) };
  const editor = new EventTarget();
  editor.value = "hello";
  const app = { tree: new NoteTree([{ id: 1, parent_id: null, title: "Acme", kind: "project" },
    { id: 2, parent_id: 1, title: "Kickoff" }, { id: 3, parent_id: 1, title: "Next" }]),
  currentId: 2, editor, agendaEditor: null, agenda: { id: null }, highlightsOf: () => [], events: new EventTarget(),
  captures: { of: (id) => (id === 2 ? [{ kind: "decision", id: 7 }] : []) } };
  const sender = new LiveSender(app, channel, { clock: () => now, timers });
  sender.listen(new EventTarget());
  app.events.dispatchEvent(new Event("redraw"));
  assertEqual(channel.sent.length, 1);
  const message = channel.sent[0];
  assertEqual(JSON.stringify(message.captures), JSON.stringify([{ kind: "decision", id: 7 }]), "the note's captures go along");
  assertEqual(JSON.stringify([message.id, message.title, message.crumbs, message.active, message.fields[0].text, message.fields[0].label]),
    JSON.stringify([2, "Kickoff", ["Projects", "Acme"], "body", "hello", "Notes"]));
  editor.dispatchEvent(new CustomEvent("cursor", { detail: { line: 0, col: 5, mode: "insert" } }));
  assertEqual(channel.sent.length, 1, "too soon: waits");
  now += 50;
  pending.shift()();
  assertEqual(channel.sent.at(-1).col, 5);
  channel.deliver({ type: "live-ask" });
  assertEqual(channel.sent.length, 3, "an ask is answered at once");
  assertTrue(channel.sent.at(-1).reply, "the answer says so");
  now += 100;
  app.events.dispatchEvent(new CustomEvent("trashed", { detail: { id: 2, next: 3 } }));
  assertTrue(channel.sent.at(-1).trashed);
  app.currentId = null;
  app.events.dispatchEvent(new Event("redraw"));
  app.currentId = 3;
  now += 100;
  app.events.dispatchEvent(new Event("redraw"));
  assertTrue(channel.sent.at(-1).trashed, "the next note opened after a trash is held");
  channel.deliver({ type: "live-ask" });
  assertEqual(channel.sent.at(-1).id, 3, "an ask is answered while held");
  assertTrue(channel.sent.at(-1).reply);
  editor.dispatchEvent(new CustomEvent("cursor", { detail: { line: 0, col: 1, mode: "normal" } }));
  assertEqual(channel.sent.at(-1).id, 3, "a key in it lets it go");
  assertTrue(channel.sent.at(-1).reply, "but is no news: the main window does not switch on a key");
  now += 100;
  editor.dispatchEvent(new CustomEvent("cursor", { detail: { line: 0, col: 2, mode: "normal" } }));
  assertTrue(!channel.sent.at(-1).reply, "only that first one");
});

test("live sender: a trash with no next note holds nothing; a note opened then is news", () => {
  const channel = fakeChannel();
  let now = 1000;
  const editor = new EventTarget();
  editor.value = "x";
  const app = { tree: new NoteTree([{ id: 1, parent_id: null, title: "Solo" }, { id: 2, parent_id: null, title: "Later" }]),
    currentId: 1, editor, agendaEditor: null, agenda: { id: null }, highlightsOf: () => [], events: new EventTarget() };
  const sender = new LiveSender(app, channel, { clock: () => now, timers: globalThis });
  sender.listen(new EventTarget());
  app.events.dispatchEvent(new CustomEvent("trashed", { detail: { id: 1, next: null } }));
  app.currentId = null;
  app.events.dispatchEvent(new Event("redraw"));
  app.currentId = 2;
  now += 100;
  app.events.dispatchEvent(new Event("redraw"));
  assertEqual(channel.sent.at(-1).id, 2, "sent at once");
  assertTrue(!channel.sent.at(-1).trashed && !channel.sent.at(-1).reply);
});

function trashScene() {
  const channel = fakeChannel();
  const clock = { now: 1000 };
  const pending = [];
  const timers = { setTimeout: (fn) => pending.push(fn) && pending.length, clearTimeout: () => pending.splice(0) };
  const editor = new EventTarget();
  editor.value = "hello";
  const app = { tree: new NoteTree([{ id: 1, parent_id: null, title: "Acme", kind: "project" },
    { id: 2, parent_id: 1, title: "Kickoff" }, { id: 3, parent_id: 1, title: "Next" }, { id: 4, parent_id: null, title: "Elsewhere" }]),
  currentId: 2, editor, agendaEditor: null, agenda: { id: null }, highlightsOf: () => [], events: new EventTarget() };
  const sender = new LiveSender(app, channel, { clock: () => clock.now, timers });
  sender.listen(new EventTarget());
  app.events.dispatchEvent(new Event("redraw"));
  const key = (col) => editor.dispatchEvent(new CustomEvent("cursor", { detail: { line: 0, col, mode: "normal" } }));
  const trash = (id, next) => app.events.dispatchEvent(new CustomEvent("trashed", { detail: { id, next } }));
  const show = (id) => {
    app.currentId = id;
    app.events.dispatchEvent(new Event("redraw"));
  };
  return { channel, clock, pending, app, key, trash, show };
}

test("live sender: a key while the trash is in flight never lets the next note out as news", () => {
  const { channel, clock, key, trash, show } = trashScene();
  clock.now += 100;
  trash(2, 3);
  const trashedAt = channel.sent.length;
  clock.now += 100;
  key(4);
  assertEqual(channel.sent.length, trashedAt, "the trashed note is not sent again over its trashed line");
  show(null);
  clock.now += 100;
  show(3);
  const next = channel.sent.at(-1);
  assertEqual(next.id, 3, "the next note goes out");
  assertTrue(next.reply, "as a reply: the main window stays where it is");
  clock.now += 100;
  key(1);
  assertTrue(!channel.sent.at(-1).reply, "once it has gone out, keys are news again");
});

test("live sender: a send waiting on its timer after a trash keeps its reply flag", () => {
  const { channel, clock, pending, key, trash, show } = trashScene();
  clock.now += 100;
  trash(2, 3);
  show(null);
  show(3);
  const at = channel.sent.length;
  key(1);
  assertTrue(channel.sent.at(-1).reply, "the first after the hold");
  key(2);
  assertEqual(channel.sent.length, at + 1, "too soon: waits");
  clock.now += 50;
  pending.shift()();
  assertEqual(channel.sent.at(-1).col, 2);
  assertTrue(!channel.sent.at(-1).reply, "queued after the next note went out: news");
  // Now a key mid-trash queues a send, and the quiet ends (an ask answered) before it fires.
  clock.now += 100;
  key(9);
  trash(3, 1);
  key(3);
  assertEqual(pending.length, 1, "queued: the last send was just now");
  show(null);
  show(1);
  channel.deliver({ type: "live-ask" });
  clock.now += 50;
  pending.shift()();
  assertEqual(channel.sent.at(-1).id, 1);
  assertTrue(channel.sent.at(-1).reply, "it carries the flag it was queued with");
});

test("live sender: a note opened on purpose after a trash is still news", () => {
  const { channel, clock, trash, show } = trashScene();
  clock.now += 100;
  trash(2, 3);
  show(null);
  clock.now += 100;
  show(4);
  assertEqual(channel.sent.at(-1).id, 4);
  assertTrue(!channel.sent.at(-1).reply, "not the note that opens by itself");
});

test("live sender: the trashed note, restored and opened again while the next is untouched, is news", () => {
  const { channel, clock, key, trash, show } = trashScene();
  clock.now += 100;
  trash(2, 3);
  show(null);
  show(3);
  const held = channel.sent.length;
  clock.now += 100;
  show(2);
  assertEqual(channel.sent.length, held + 1, "the reopened note goes out");
  assertEqual(channel.sent.at(-1).id, 2);
  assertTrue(!channel.sent.at(-1).trashed && !channel.sent.at(-1).reply, "as news, over its trashed line");
  clock.now += 100;
  key(1);
  assertEqual(channel.sent.at(-1).col, 1, "and typing in it reaches the Live page");
});

test("live sender: a note trashed elsewhere (already gone from the tree) still holds the next one", () => {
  const { channel, clock, app, trash, show } = trashScene();
  clock.now += 100;
  app.tree = new NoteTree([{ id: 1, parent_id: null, title: "Acme", kind: "project" }, { id: 3, parent_id: 1, title: "Next" }]);
  const at = channel.sent.length;
  trash(2, 1);
  assertEqual(channel.sent.length, at, "nothing to say about a note no longer in the tree");
  show(1);
  assertEqual(channel.sent.length, at, "the next note is held");
});

// shown: the page over the dashboard (views.shown); live: the Live page's note id.
function trashApp({ role, notes, currentId, parent = null, shown: view = null, live: liveId = null }) {
  const opened = [];
  const switched = [];
  const events = [];
  const shown = [];
  const app = {
    role, currentId, tree: new NoteTree(notes),
    trash: { days: 7 },
    events: new EventTarget(),
    views: { shown: view, pages: { live: { state: liveId === null ? null : { id: liveId } } } },
    session: { note: { id: currentId, title: "Gone", parent_id: parent }, close() { app.sessionClosed = true; } },
    api: { remove: async (id, recursive) => { app.removed = [id, recursive]; } },
    changes: { send() {} },
    refreshTree: async () => {},
    open: async (id, options = {}) => { opened.push(id); app.discarded = options.discard; },
    switchTo: async (id) => switched.push(id),
    showView: (view) => shown.push(view),
    say() {},
    editor: { value: "the gone note's text", readOnly: false },
    agenda: { open: (note) => { app.agendaOpened = note; } },
    redraw() {},
  };
  for (const name of ["screenNoteId", "isDashboard", "dashboardAfter", "nextAfterDeleting", "trashCommand", "leaveTrashed", "showNoNote"]) {
    app[name] = NotesApp.prototype[name];
  }
  app.events.addEventListener("trashed", (event) => events.push(event.detail));
  return { app, opened, switched, events, shown };
}

test("trash in the main window: a hub's goes to the next dashboard, never a plain note", async () => {
  const notes = [{ id: 1, parent_id: null, title: "Loose note" }, { id: 2, parent_id: null, title: "Acme", kind: "project" },
    { id: 3, parent_id: null, title: "Northwind", kind: "area" }];
  const { app, opened, shown } = trashApp({ role: "main", notes, currentId: 2 });
  await app.trashCommand(true);
  assertEqual(opened.join(), "3", "the first top-level dashboard, not the plain note before it");
  const alone = trashApp({ role: "main", notes: notes.slice(0, 2), currentId: 2 });
  await alone.app.trashCommand(true);
  assertEqual(alone.opened.length, 0, "no dashboard left: nothing opens, so nothing goes to the note window");
  assertEqual(alone.shown.join(), "home", "and the main window goes Home, not left on the gone hub");
  assertEqual(shown.length, 0, "a dashboard to go to: no Home");
});

test("trash in the main window with no note open: says so and sends nothing", async () => {
  const removed = [];
  const { app, opened, shown } = trashApp({ role: "main", notes: [{ id: 1, parent_id: null, title: "Loose note" }], currentId: null });
  app.api.remove = async (id) => removed.push(id);
  let message = "";
  try { await app.trashCommand(false); } catch (error) { message = error.message; }
  assertEqual(message, "E: no note is open");
  assertEqual(removed.length, 0, "no delete with id null");
  assertEqual(opened.length + shown.length, 0, "and the window stays where it is");
});

test("trash in the main window: a nested dashboard goes to its parent's hub", async () => {
  const notes = [{ id: 1, parent_id: null, title: "Loose note" }, { id: 2, parent_id: null, title: "Acme", kind: "project" },
    { id: 5, parent_id: 2, title: "Folder" }, { id: 6, parent_id: 5, title: "Inner", kind: "person" }];
  const { app, opened } = trashApp({ role: "main", notes, currentId: 6 });
  await app.trashCommand(true);
  assertEqual(opened.join(), "2");
});

test("trash on Live (main window): the Live note goes, not the hub under the page", async () => {
  const notes = [{ id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 7, parent_id: 2, title: "Kickoff" },
    { id: 8, parent_id: 2, title: "Notes" }, { id: 3, parent_id: null, title: "Northwind", kind: "area" }];
  const { app, opened, events } = trashApp({ role: "main", notes, currentId: 3, shown: "live", live: 7 });
  await runNoteCommand(app, { name: "trash", bang: false });
  assertEqual(JSON.stringify(app.removed), "[7,false]", "the note on screen, never the hidden hub (3)");
  assertEqual(opened.join(), "2", "then the dashboard of the note's parent");
  assertEqual(JSON.stringify(events), JSON.stringify([{ id: 7, next: 2 }]));
  assertTrue(!app.sessionClosed, "the hub under the page stays open in its session");
  assertEqual(app.discarded, false, "the hub's unsaved edits are saved, not thrown away");
  const shown = trashApp({ role: "main", notes, currentId: 7 });
  await runNoteCommand(shown.app, { name: "trash", bang: false });
  assertEqual(shown.app.discarded, true, "the trashed note's own edits are thrown away");
});

test("open of the hub already under Live, history replace: the URL loses the live flag", async () => {
  const replaced = [];
  const pushed = [];
  let hidden = false;
  const app = {
    role: "main", currentId: 2, tree: new NoteTree([{ id: 2, parent_id: null, title: "Acme", kind: "project" }]),
    isDashboard: () => true,
    views: { get shown() { return hidden ? null : "live"; }, hide() { hidden = true; } },
    history: { replaceState: (_s, _t, url) => replaced.push(url), pushState: (_s, _t, url) => pushed.push(url) },
    switchTo: async () => true,
    redraw() {}, focusNote() {},
  };
  const saved = localStorage.getItem("paradigm.recent");
  try {
    assertTrue(await NotesApp.prototype.open.call(app, 2, { history: "replace" }));
  } finally {
    if (saved === null) localStorage.removeItem("paradigm.recent");
    else localStorage.setItem("paradigm.recent", saved);
  }
  assertTrue(hidden, "the Live page is hidden");
  assertEqual(replaced.length, 1, "the address is rewritten even though switchTo skips the same note");
  assertTrue(/\?note=2$/.test(replaced[0]), `no live flag left: ${replaced[0]}`);
  assertEqual(pushed.length, 0, "replace, not a new history entry");
});

test("trash on Live with no note there: refused, nothing sent", async () => {
  const notes = [{ id: 2, parent_id: null, title: "Acme", kind: "project" }];
  const { app, opened } = trashApp({ role: "main", notes, currentId: 2, shown: "live" });
  assertEqual(await rejection(runNoteCommand(app, { name: "trash", bang: true })), "E: no note on this page");
  const gone = trashApp({ role: "main", notes, currentId: 2, shown: "live", live: 9 });
  assertEqual(await rejection(runNoteCommand(gone.app, { name: "trash" })), "E: no note on this page", "a Live note already gone");
  assertEqual(app.removed ?? gone.app.removed, undefined);
  assertEqual(opened.length, 0);
});

test("trash on the task page, Today and the Week: refused, the hub under the page stays", async () => {
  const notes = [{ id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 3, parent_id: null, title: "Northwind", kind: "area" }];
  for (const [view, message] of [["task", "E: this page shows a task: x deletes it"], ["home", "E: no note on this page"],
    ["week", "E: no note on this page"], ["people", "E: no note on this page"]]) {
    for (const bang of [false, true]) {
      const { app, opened, shown } = trashApp({ role: "main", notes, currentId: 2, shown: view });
      assertEqual(await rejection(runNoteCommand(app, { name: "trash", bang })), message, `${view}${bang ? " !" : ""}`);
      assertEqual(app.removed, undefined, `${view}: nothing trashed`);
      assertEqual(opened.length + shown.length, 0, `${view}: the window stays`);
    }
  }
});

test("trash on Plan and in the note window: the open note, as before", async () => {
  const notes = [{ id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 3, parent_id: null, title: "Northwind", kind: "area" }];
  const plan = trashApp({ role: "main", notes, currentId: 2, shown: "plan" });
  await runNoteCommand(plan.app, { name: "trash", bang: true });
  assertEqual(JSON.stringify(plan.app.removed), "[2,true]", "Plan is the hub's own chart");
  // The note window has no pages: whatever views says, its note is the one open.
  const note = trashApp({ role: "note", notes, currentId: 3, shown: "home" });
  await runNoteCommand(note.app, { name: "trash" });
  assertEqual(JSON.stringify(note.app.removed), "[3,false]");
});

test("trash in the note window: still opens the parent, and tells the sender what opens next", async () => {
  const notes = [{ id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 7, parent_id: 2, title: "Kickoff" }];
  const { app, opened, events } = trashApp({ role: "note", notes, currentId: 7 });
  await app.trashCommand(false);
  assertEqual(opened.join(), "2");
  assertEqual(JSON.stringify(events), JSON.stringify([{ id: 7, next: 2 }]));
});

test("a note trashed in the other window: leaving it goes the trash's quiet way", async () => {
  // Already gone from the tree, as reloadIfChanged finds it.
  const notes = [{ id: 1, parent_id: null, title: "Loose note" }, { id: 2, parent_id: null, title: "Acme", kind: "project" }];
  const { app, switched, events } = trashApp({ role: "note", notes, currentId: 7, parent: 2 });
  await app.leaveTrashed();
  assertEqual(switched.join(), "2");
  assertEqual(JSON.stringify(events), JSON.stringify([{ id: 7, next: 2 }]), "the sender holds the dashboard that opens next");
});

test("the last hub trashed in the other window: the note window empties and takes no typing", async () => {
  const notes = [{ id: 1, parent_id: null, title: "Loose note" }];
  const { app, switched } = trashApp({ role: "note", notes, currentId: 7 });
  await app.leaveTrashed();
  assertEqual(switched.length, 0, "no dashboard left: nothing opens");
  assertEqual(app.editor.value, "", "the gone note's text is not left behind");
  assertTrue(app.editor.readOnly, "typing would save nowhere");
  assertEqual(JSON.stringify(app.agendaOpened), "{}", "and a meeting's agenda box closes too");
  const main = trashApp({ role: "main", notes, currentId: 7 });
  await main.app.leaveTrashed();
  assertEqual(main.app.editor.value, "the gone note's text", "the main window shows no editor: left alone");
});

test("live page: a note opened while the ask is out still switches the page", () => withPage(({ page, switched }) => {
  page.receive(live("a", { id: 2 }));
  assertEqual(switched.join(), "2");
  page.receive(live("a", { id: 2, reply: true }));
  assertEqual(switched.join(), "2", "the answer that follows is no new note");
}));

test("live page: a save of the hub under the page reloads it without leaving the page", async () => {
  const calls = [];
  const app = {
    currentId: 4, tree: new NoteTree([{ id: 4, parent_id: null, title: "Acme" }]),
    session: { dirty: false, note: { version: 1 } }, agenda: { dirty: false, id: null },
    api: { get: async () => ({ id: 4, version: 2, body: "y" }) },
    open: async () => calls.push("open"),
    switchTo: async (id, options) => calls.push(["switchTo", id, options.discard, options.history]),
  };
  await NotesApp.prototype.reloadIfChanged.call(app);
  assertEqual(JSON.stringify(calls), JSON.stringify([["switchTo", 4, true, "none"]]), "open() would hide the Live page");
});

test("live page: a meeting's Agenda and Notes get their own ids, so their headings and footnotes never clash", () => withPage(({ page, section }) => {
  const text = "## Actions\n\nSee [^1].\n\n[^1]: a note";
  page.receive(live(text, { fields: [{ name: "agenda", label: "Agenda", text, highlights: [] },
    { name: "body", label: "Notes", text, highlights: [] }] }));
  const ids = [...section.querySelectorAll("[id]")].map((node) => node.id);
  assertTrue(ids.includes("live-agenda-actions") && ids.includes("live-body-actions"), ids.join());
  assertEqual(new Set(ids).size, ids.length, `no id twice: ${ids.join()}`);
}));

test("live page: a new note waits for the app's start, so the start's own page doesn't replace it", async () => {
  const section = document.createElement("section");
  document.body.append(section);
  const app = fakeApp();
  const order = [];
  let finish = null;
  const started = new Promise((resolve) => { finish = resolve; });
  const page = new LivePage(section, { changes: fakeChannel(), app: () => app, ready: () => started,
    onNewNote: (id) => order.push(`live ${id}`) });
  try {
    page.receive(live("hello", { id: 2 }));
    assertEqual(order.length, 0, "not while the app starts");
    order.push("start done");
    finish();
    await started;
    await Promise.resolve();
    assertEqual(order.join(), "start done,live 2");
  } finally {
    section.remove();
  }
});

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error.message;
  }
  return "no error";
}

test("rendered text: a footnote's \"#\" link stays on the page, even when the page's URL names a note", () => {
  const before = window.location.href;
  history.replaceState(history.state, "", `${window.location.pathname}?note=2&live`);
  const root = document.createElement("div");
  const footnote = Object.assign(document.createElement("a"), { href: "#live-body-fn-1", textContent: "1" });
  const note = Object.assign(document.createElement("a"), { href: "?note=7", textContent: "Acme" });
  root.append(footnote, note);
  document.body.append(root);
  const opened = [];
  followNoteLinks(root, (id) => opened.push(id));
  try {
    const footClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    root.addEventListener("click", (event) => { if (event.target === footnote) event.preventDefault(); }, { once: false });
    footnote.dispatchEvent(footClick);
    assertEqual(opened.join(), "", "the footnote opens no note (the browser moves to it on the page)");
    note.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    assertEqual(opened.join(), "7", "a link to a note still opens it");
  } finally {
    root.remove();
    history.replaceState(history.state, "", before);
  }
});
