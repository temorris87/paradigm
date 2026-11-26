// The Live page (static/js/live/live-page.js) on a page: the caret, the band, the lines it shows
// for no note, a closed note window, a trashed or empty note; and the sender's message.
import { CARET } from "../../static/js/live/caret.js";
import { LivePage, swapCaret } from "../../static/js/live/live-page.js";
import { LiveSender } from "../../static/js/live/live-sender.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
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
  page.receive(live("D: Ship it", { fields: [{ name: "body", label: "Notes", text: "D: Ship it", highlights }], col: 0, mode: "normal", reply: true }));
  assertEqual(switched.length, 0, "the answer to live-ask");
  const badge = section.querySelector(".pd-highlight__badge");
  assertEqual(badge.textContent, "Decision");
  badge.click();
  assertEqual(app.opened.join(), "9");
  page.receive(live("x", { id: 2 }));
  assertEqual(switched.join(), "2");
  page.receive(live("xy", { id: 2 }));
  assertEqual(switched.join(), "2", "typing never switches");
}));

test("live page: the block caret covers its character on a captured line, past the badge", () => withPage(({ page, section }) => {
  const text = "Discussed the rollout.\nD: Use the Acme vendor";
  const highlights = [{ text: "Use the Acme vendor", label: "Decision", title: "", data: 9, capture: "decision", meta: "" }];
  const at = (col) => live(text, { fields: [{ name: "body", label: "Notes", text, highlights }], line: 1, col, mode: "normal" });
  page.receive(at(text.split("\n")[1].length - 1));
  let caret = section.querySelector(".live-caret--block");
  assertEqual(caret.textContent, "r", "on the last r");
  assertTrue(!caret.classList.contains("live-caret--empty"));
  assertTrue(section.textContent.includes("Use the Acme vendor"), "no character lost");
  page.receive(at(3));
  caret = section.querySelector(".live-caret--block");
  assertEqual(caret.textContent, "U", "on the U");
  assertTrue(!caret.classList.contains("live-caret--empty"));
  const badge = section.querySelector(".pd-highlight__badge");
  assertTrue(badge.compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING, "after the badge");
  assertTrue(caret.closest(".pd-highlight") !== null, "inside the highlight, so the U stays underlined");
  assertTrue(section.textContent.includes("Use the Acme vendor"));
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
  currentId: 2, editor, agendaEditor: null, agenda: { id: null }, highlightsOf: () => [], events: new EventTarget() };
  const sender = new LiveSender(app, channel, { clock: () => now, timers });
  sender.listen(new EventTarget());
  app.events.dispatchEvent(new Event("redraw"));
  assertEqual(channel.sent.length, 1);
  const message = channel.sent[0];
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

test("live page: a note opened while the ask is out still switches the page", () => withPage(({ page, switched }) => {
  page.receive(live("a", { id: 2 }));
  assertEqual(switched.join(), "2");
  page.receive(live("a", { id: 2, reply: true }));
  assertEqual(switched.join(), "2", "the answer that follows is no new note");
}));

test("live page: a save of the hub under the page reloads it without leaving the page", async () => {
  const calls = [];
  const app = {
    currentId: 4, session: { dirty: false, note: { version: 1 } }, agenda: { dirty: false, id: null },
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
