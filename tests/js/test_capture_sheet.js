// The capture sheet (static/js/notes/capture-sheet.js) in a real page: its fields, Tab order,
// the role and the day, the kind keys, Enter and Esc; and <pd-editor>'s side of it: the
// leader's events, the line marks and the docked slot.
import "../../static/js/editor/pd-editor.js";
import { sheetState } from "../../static/js/notes/capture-model.js";
import { CaptureSheet } from "../../static/js/notes/capture-sheet.js";
import { CAPTURE_SHEET_KEYS, sheetAction, sheetHints } from "../../static/js/notes/capture-sheet-keys.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
const TODAY = "2026-11-27";
const tree = new NoteTree([
  { id: 1, parent_id: null, title: "Team", kind: "area", updated_at: T },
  { id: 2, parent_id: 1, title: "1:1 Ada", kind: "meeting", updated_at: T },
  { id: 6, parent_id: null, title: "Grace Liu", kind: "person", updated_at: T },
  { id: 5, parent_id: null, title: "Ben Ortiz", kind: "person", updated_at: T },
]);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// The editor draws only the lines on screen, and its height is known once its stylesheet is in
// and the ResizeObserver has run after the sheet closed: wait for that rather than race it.
async function lineDrawn(editor, line) {
  const selector = `.pd-line[data-line="${line}"]`;
  for (let i = 0; i < 120 && !editor.shadowRoot.querySelector(selector); i += 1) await frame();
  return editor.shadowRoot.querySelector(selector);
}

// The editor's rows are measured from its stylesheets, which load after it is connected.
const styled = (editor) => Promise.all([...editor.shadowRoot.querySelectorAll('link[rel="stylesheet"]')]
  .filter((link) => !link.sheet)
  .map((link) => new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  })));

function press(key, mods = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  document.activeElement.dispatchEvent(event);
  return event;
}

async function withSheet(text, body) {
  const root = document.createElement("section");
  document.body.append(root);
  const saved = [];
  let cancelled = 0;
  let failWith = null;
  const sheet = new CaptureSheet(root, {
    tree: () => tree,
    today: () => TODAY,
    onSave: async (payload) => {
      if (failWith) throw new Error(failWith);
      saved.push(payload);
    },
    onCancel: () => {
      cancelled += 1;
    },
    pickHub: async () => null,
  });
  sheet.open(sheetState({ kind: "task", text, line: 0, sourceId: 2, tree, meetingDay: "2026-11-27", today: TODAY }));
  try {
    await body({ sheet, root, saved, cancelled: () => cancelled, fail: (text) => { failWith = text; } });
  } finally {
    root.remove();
  }
}

const visible = (root, selector) => [...root.querySelectorAll(selector)].filter((node) => !node.closest("[hidden]"));

test("capture sheet: opens filled from the line, the focus in the Title with the caret at the end", () => withSheet(
  "Grace will share the dashboards with Chloe", ({ root }) => {
    const title = root.querySelector(".capture-sheet__title");
    assertTrue(document.activeElement === title, "the Title has the focus");
    assertEqual(title.value, "Grace will share the dashboards with Chloe");
    assertEqual(title.selectionStart, title.value.length);
    assertEqual(root.querySelector(".capture-sheet__who").value, "Grace Liu");
    assertEqual(root.querySelector(".capture-sheet__row:nth-child(2) .capture-sheet__note").textContent, "found in the line");
    assertEqual(root.querySelector(".capture-sheet__role--on").textContent, "Grace does it");
    assertEqual(visible(root, ".capture-sheet__label").map((label) => label.textContent).join(), "Title,Who,Role,Follow up,Goes to");
    assertEqual(root.querySelector(".capture-sheet__day").value, "Mon 30 Nov");
    assertEqual(root.querySelector(".capture-sheet__hub").textContent, "Team (this meeting's hub) ▾");
    assertEqual(root.querySelector(".capture-sheet__save").textContent, "Save task");
    assertEqual([...root.querySelectorAll(".capture-sheet__keys .key")].map((cap) => cap.textContent).join(), "Enter,Tab,t q d,Esc");
  }));

test("capture sheet: Tab walks Title, Who, role, day, Goes to; ←/→ picks I owe and the day row becomes Due", () => withSheet(
  "Grace will share the dashboards", async ({ root, saved }) => {
    const order = [];
    for (let step = 0; step < 5; step += 1) {
      press("Tab");
      order.push(document.activeElement.className.split(" ").at(-1));
    }
    assertEqual(order.join(), "capture-sheet__who,capture-sheet__role--on,capture-sheet__day,capture-sheet__hub,capture-sheet__title");
    press("Tab", { shiftKey: true });
    assertTrue(document.activeElement.classList.contains("capture-sheet__hub"), "Shift-Tab goes back");
    root.querySelector(".capture-sheet__role--on").focus();
    press("ArrowRight");
    assertEqual(root.querySelector(".capture-sheet__role--on").textContent, "I owe Grace");
    assertTrue(document.activeElement.classList.contains("capture-sheet__role--on"), "the focus stays on the role");
    assertEqual(visible(root, ".capture-sheet__label").map((label) => label.textContent).join(), "Title,Who,Role,Due,Goes to");
    press("Enter");
    await tick();
    assertEqual(JSON.stringify(saved), JSON.stringify([{ source_id: 2, kind: "task", title: "Grace will share the dashboards",
      quote: "Grace will share the dashboards", hub_id: 1, person_id: 6, role: "for" }]));
  }));

test("capture sheet: + and - move the day, typing sets it; t q d switch the kind off a text box, Alt in one", () => withSheet(
  "Grace will share it", async ({ root, saved }) => {
    const day = root.querySelector(".capture-sheet__day");
    day.focus();
    press("+");
    assertEqual(day.value, "Tue 1 Dec");
    press("-");
    press("-");
    assertEqual(day.value, "Sun 29 Nov");
    day.value = "2026";
    day.dispatchEvent(new Event("input"));
    assertTrue(!press("-").defaultPrevented, "a - after typed digits is a hyphen");
    assertEqual(day.value, "2026", "and the typed digits stay");
    day.value = "2026-12-04";
    day.dispatchEvent(new Event("input"));
    assertTrue(!press("-").defaultPrevented, "a - in a typed date types");
    root.querySelector(".capture-sheet__hub").focus();
    press("q");
    assertEqual(root.dataset.kind, "question");
    assertEqual(root.querySelector(".capture-sheet__save").textContent, "Save question");
    assertEqual(visible(root, ".capture-sheet__label").map((label) => label.textContent).join(), "Title,Who,Goes to");
    root.querySelector(".capture-sheet__title").focus();
    press("t");
    assertEqual(root.dataset.kind, "question", "t types in the Title");
    press("†", { altKey: true, code: "KeyT" });
    assertEqual(root.dataset.kind, "task", "Alt+T, by the physical key");
    press("Enter");
    await tick();
    assertEqual(saved[0].follow_up, "2026-12-04");
  }));

test("capture sheet: a day typed over the one shown (after Tab or +) replaces it", () => withSheet(
  "@Grace ? the budget review", async ({ root, saved }) => {
    const day = root.querySelector(".capture-sheet__day");
    press("Tab");
    press("Tab");
    press("Tab");
    assertTrue(document.activeElement === day, "Tab reached the day");
    assertEqual(day.value, "Mon 30 Nov");
    assertEqual(day.selectionStart, 0, "the shown day is selected");
    assertEqual(day.selectionEnd, day.value.length);
    press("+");
    assertEqual(day.value, "Tue 1 Dec");
    assertEqual(day.selectionEnd - day.selectionStart, day.value.length, "and stays selected after +");
    day.setRangeText("fri", day.selectionStart, day.selectionEnd, "end");
    day.dispatchEvent(new Event("input"));
    assertEqual(day.value, "fri");
    press("Enter");
    await tick();
    assertEqual(saved[0].follow_up, "2026-11-27", "the coming Friday, today included");
  }));

test("capture sheet: a kind key on the role keeps the focus off the Title, so the next one switches too", () => withSheet(
  "Grace will share it", ({ root }) => {
    const title = root.querySelector(".capture-sheet__title");
    press("Tab");
    press("Tab");
    press("q");
    assertEqual(root.dataset.kind, "question");
    assertTrue(document.activeElement !== title, "not in the Title");
    press("d");
    assertEqual(root.dataset.kind, "decision");
    assertEqual(title.value, "Grace will share it", "nothing typed into the title");
    press("Tab");
    assertTrue(document.activeElement === title, "Tab from the sheet goes to the Title");
  }));

test("capture sheet: Esc cancels and nothing is saved; an error shows inside and it stays open", () => withSheet(
  "Book the room", async ({ sheet, root, saved, cancelled, fail }) => {
    assertTrue(root.querySelector(".capture-sheet__row:nth-child(3)").hidden, "no person: no role row");
    press("Escape");
    assertEqual(cancelled(), 1);
    assertEqual(saved.length, 0);
    fail("already captured");
    root.querySelector(".capture-sheet__title").focus();
    press("Enter");
    await tick();
    assertEqual(root.querySelector(".capture-sheet__error").textContent, "E: already captured");
    assertTrue(sheet.isOpen);
  }));

test("capture sheet: a failed save's error goes once the day is fixed or the kind switched", () => withSheet(
  "Book the room", async ({ root }) => {
    const error = () => root.querySelector(".capture-sheet__error").textContent;
    const day = root.querySelector(".capture-sheet__day");
    day.value = "qt";
    day.dispatchEvent(new Event("input"));
    day.focus();
    press("Enter");
    await tick();
    assertEqual(error(), 'E: not a day: "qt"');
    day.value = "";
    day.dispatchEvent(new Event("input"));
    assertEqual(error(), "", "editing the day clears it");
    day.value = "qt";
    day.dispatchEvent(new Event("input"));
    press("Enter");
    await tick();
    root.querySelector(".capture-sheet__hub").focus();
    press("q");
    assertEqual(error(), "", "switching the kind clears it");
  }));

test("capture sheet keys: one table; scopes keep t q d out of text boxes", () => {
  const key = (k, mods = {}) => ({ key: k, code: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  assertEqual(sheetAction(key("t"), { field: "hub", text: false }), "task");
  assertEqual(sheetAction(key("t"), { field: "title", text: true }), null);
  assertEqual(sheetAction(key("Enter"), { field: "who", text: true }), "save");
  assertEqual(sheetAction(key("Tab", { shiftKey: true }), { field: "day", text: true }), "previous");
  assertEqual(sheetAction(key("+"), { field: "day", text: true }), "dayLater");
  assertEqual(sheetAction(key("+"), { field: "title", text: true }), null);
  assertEqual(sheetAction(key("-"), { field: "day", text: true }), "dayEarlier");
  assertEqual(sheetAction(key("-"), { field: "day", text: true, typing: true }), null, "typing a date: - is a hyphen");
  assertEqual(sheetAction(key("+"), { field: "day", text: true, typing: true }), "dayLater");
  assertEqual(sheetAction(key("ArrowLeft"), { field: "role", text: false }), "rolePrevious");
  assertEqual(sheetAction(key("d", { ctrlKey: true }), { field: "hub", text: false }), null);
  assertEqual(sheetHints().map(({ cap, words }) => `${cap} ${words}`).join(), "Enter save,Tab next field,t q d kind,Esc cancel");
  assertTrue(CAPTURE_SHEET_KEYS.every((entry) => entry.help));
});

test("editor: \\t sends capture; setLineMarks draws a gutter glyph and a chip; the dock sits over the status line", async () => {
  const editor = document.createElement("pd-editor");
  const dock = document.createElement("section");
  dock.slot = "dock";
  dock.textContent = "sheet";
  editor.append(dock);
  document.body.append(editor);
  try {
    editor.value = "intro\nBen to check";
    const events = [];
    editor.addEventListener("capture", (event) => events.push(event.detail));
    editor.focus();
    const input = editor.shadowRoot.querySelector(".pd-input");
    for (const key of ["j", "\\", "t"]) input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }));
    await tick();
    assertEqual(events.map((detail) => `${detail.kind}:${detail.line}:${detail.text}`).join(), "task:1:Ben to check");
    editor.setLineMarks([{ line: 1, glyph: "□", label: "Task → Ben · follow up Mon", tone: "info" }]);
    const line = editor.shadowRoot.querySelector('.pd-line[data-line="1"]');
    assertEqual(line.querySelector(".pd-gutter").textContent, "□");
    const chip = line.querySelector(".pd-mark");
    assertEqual(chip.textContent, "Task → Ben · follow up Mon");
    assertTrue(chip.classList.contains("chip") && chip.classList.contains("chip--info"), "the shared chip");
    assertEqual(editor.shadowRoot.querySelector('.pd-line[data-line="0"] .pd-gutter'), null);
    const slot = editor.shadowRoot.querySelector('slot[name="dock"]');
    assertTrue(slot.nextElementSibling.classList.contains("pd-status"), "the dock is just over the status line");
    assertTrue(slot.assignedElements()[0] === dock);
    editor.setLineMarks([]);
    assertEqual(editor.shadowRoot.querySelector(".pd-gutter"), null);
  } finally {
    editor.remove();
  }
});

test("note captures: \\t opens the sheet; Enter saves, marks the line and says where; \\u removes it", async () => {
  const { NoteCaptures } = await import("../../static/js/notes/capture-actions.js");
  const editor = document.createElement("pd-editor");
  const dock = document.createElement("section");
  dock.slot = "dock";
  editor.append(dock);
  const strip = document.createElement("div");
  document.body.append(editor, strip);
  await styled(editor);
  const said = [];
  const sent = [];
  const made = [];
  const removed = [];
  const app = {
    editor, tree, currentId: 2, today: () => TODAY, meetings: { get: () => ({ day: "2026-11-27" }) },
    guard: (promise) => Promise.resolve(promise).catch((error) => said.push(`fail ${error.message}`)),
    fail: (error) => said.push(`fail ${error.message}`), say: (text) => said.push(text),
    changes: { send: (message) => sent.push(message.type) }, refreshTree: async () => {}, redraw: () => {},
  };
  const api = {
    list: async () => [],
    make: async (payload) => {
      made.push(payload);
      return { kind: payload.kind, id: 41, title: payload.title, quote: payload.quote, hub_id: 1, hub_title: "Team", person_id: 6,
        person_name: "Grace Liu", role: payload.role, follow_up: payload.follow_up ?? null, due: null, open: true };
    },
    remove: async (kind, id) => removed.push(`${kind}:${id}`),
  };
  try {
    editor.value = "Intro\nGrace will share the dashboards";
    const captures = new NoteCaptures(app, { api, sheet: dock, strip });
    captures.sync(2);
    await tick();
    assertTrue(strip.hidden, "no captures, no strip");
    await captures.capture({ kind: "task", line: 1, text: "Grace will share the dashboards" });
    assertTrue(!dock.hidden, "the sheet is open");
    press("Enter");
    await tick();
    await tick();
    assertEqual(made.map((payload) => `${payload.kind}:${payload.person_id}:${payload.role}:${payload.follow_up}`).join(), "task:6:delegate:2026-11-30");
    assertTrue(dock.hidden, "the sheet closed");
    assertEqual(editor.value, "Intro\nGrace will share the dashboards", "the line keeps its text");
    assertEqual(said.at(-1), "1 captured → Team");
    await captures.save({ ...made[0] }).catch((error) => said.push(`fail ${error.message}`));
    assertEqual(said.at(-1), "fail E: already captured", "a known capture is refused before the POST");
    assertEqual(made.length, 1, "no second POST, so no 409 in the console");
    assertTrue(sent.includes("changed"));
    // The open sheet squeezed the editor to a row or so; its ResizeObserver gives the rows back
    // only on the next frame, which two setTimeout ticks do not always reach under load. Measure
    // now, then wait for line 1 to be drawn before its mark is looked for.
    editor.measure();
    const mark = (await lineDrawn(editor, 1))?.querySelector(".pd-mark");
    assertEqual(mark?.textContent, "Task → Grace · follow up Mon");
    assertEqual(strip.textContent, "From this meeting:Tasks 1Questions 0Decisions 0they live in Team · Tab opens");
    await captures.uncapture({ line: 0, text: "Intro" }).catch((error) => said.push(`fail ${error.message}`));
    assertEqual(said.at(-1), "fail E: nothing captured on this line");
    await captures.uncapture({ line: 1, text: "Grace will share the dashboards" });
    assertEqual(removed.join(), "task:41");
    assertEqual(said.at(-1), "Removed task: Grace will share the dashboards");
    assertEqual(editor.shadowRoot.querySelector(".pd-mark"), null, "its mark went");
    const none = { ...app, currentId: 7 };
    const loose = new NoteCaptures(none, { api, sheet: document.createElement("section") });
    let error = "";
    await loose.capture({ kind: "task", line: 0, text: "x" }).catch((thrown) => { error = thrown.message; });
    assertEqual(error, "E: no hub to capture to");
  } finally {
    editor.remove();
    strip.remove();
  }
});

test("capture sheet: its fields' native change and input stay in the sheet, away from the editor around it", () => withSheet(
  "Ben to check the numbers", ({ root }) => {
    const heard = [];
    const host = document.createElement("div");
    root.replaceWith(host);
    host.append(root);
    for (const type of ["change", "input"]) host.addEventListener(type, (event) => heard.push(event.type));
    const title = root.querySelector(".capture-sheet__title");
    title.value = "Ben to check the load-test numbers";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    title.dispatchEvent(new Event("change", { bubbles: true }));
    assertEqual(heard.join(), "");
    host.replaceWith(root);
  }));
