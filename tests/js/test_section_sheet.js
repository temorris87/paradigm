// The note window's sections sheet: the bar's counts (pure), and the sheet opening and closing.
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { sectionSummary, summaryText } from "../../static/js/hubs/section-summary.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const TODAY = new Date(2026, 10, 23);
const tree = () => new NoteTree([
  { id: 1, parent_id: null, title: "Acme", kind: "project", status: "active", due: "", updated_at: T },
  { id: 2, parent_id: 1, title: "Site survey", updated_at: T },
  { id: 3, parent_id: 1, title: "Weekly sync", kind: "meeting", updated_at: T },
  { id: 4, parent_id: null, title: "Loose", kind: "template", updated_at: T },
]);
const task = (id, noteId, more = {}) => ({ id, note_id: noteId, parent_id: null, title: `t${id}`, notes: "", due: "",
  delegate_id: null, follow_up: "", done: false, done_day: "", position: id, ...more });
const TASKS = () => new Tasks([task(10, 2), task(11, 2, { due: "2026-11-20" }), task(12, 2, { done: true }),
  task(13, 2, { parent_id: 10 }), task(14, 2)]);

test("section summary: open top-level tasks, late ones flagged; files missing, folders not counted; empty sections kept", () => {
  const parts = sectionSummary([
    { key: "tasks", label: "Tasks", rows: [
      { depth: 0, task: 1, done: false, late: true },
      { depth: 0, task: 2, done: true, late: false },
      { depth: 1, task: 3, done: false, late: true },
      { depth: 1, addSubtask: 1 },
      { depth: 0, task: 4, done: false } ] },
    { key: "files", label: "Files", rows: [{ depth: 0, folder: 7 }, { depth: 0, file: 1, late: true }, { depth: 0, file: 2 }] },
    { key: "decisions", label: "Decisions", rows: [] },
  ]);
  assertEqual(summaryText(parts), "Tasks 2 (1 late) · Files 2 (1 missing) · Decisions 0");
});

// A headless browser window may never hold the OS focus: focus() then moves activeElement but
// fires no focus or focusin, which the sheet's open and close rules listen for. Fire them by hand
// only then, so a focused browser still tests the real events.
function focusOn(node) {
  const from = document.activeElement;
  node.focus();
  if (document.hasFocus() || document.activeElement !== node || from === node) return;
  node.dispatchEvent(new FocusEvent("focus", { relatedTarget: from }));
  node.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: from }));
}

function withSheet(body) {
  localStorage.removeItem("paradigm.hub.folds");
  const app = document.createElement("div");
  app.className = "app";
  const page = document.createElement("main");
  const editor = document.createElement("textarea");
  const sheet = document.createElement("section");
  sheet.className = "sheet";
  const section = document.createElement("section");
  const bar = document.createElement("button");
  bar.className = "sheet__bar";
  sheet.append(section, bar);
  page.append(editor, sheet);
  app.append(page);
  document.body.append(app);
  const style = document.createElement("style");
  style.textContent = ".sheet:not(.sheet--open) .hub { display: none; } .sheet[hidden] { display: none; }";
  document.head.append(style);
  let left = 0;
  const hub = new HubPage({ page, line: document.createElement("div"), section, sheet, onOpen: () => {},
    onLeave: () => { left += 1; editor.focus(); } });
  try {
    body({ hub, sheet, bar, editor, section, left: () => left });
  } finally {
    app.remove();
    style.remove();
    localStorage.removeItem("paradigm.hub.folds");
  }
}

const isOpen = (sheet) => sheet.classList.contains("sheet--open");
const ctx = () => ({ tree: tree(), tasks: TASKS(), today: TODAY });

test("section sheet: the bar counts each section; no sections, no bar", () => withSheet(({ hub, sheet, bar }) => {
  hub.show(ctx(), 2);
  assertTrue(!sheet.hidden && !isOpen(sheet), "a note's sheet starts closed");
  assertTrue(bar.getAttribute("aria-label").endsWith("Tasks 3 (1 late) · Files 0"), bar.getAttribute("aria-label"));
  assertEqual(bar.querySelector(".sheet__caret").textContent, "▴");
  hub.show(ctx(), 3);
  assertTrue(bar.getAttribute("aria-label").endsWith("Tasks 0 · Questions 0 · Decisions 0 · Files 0"), "a meeting's");
  hub.show(ctx(), 4);
  assertTrue(sheet.hidden, "a template has no sections and no bar");
}));

test("section sheet: :hub and a click open it; Escape and the text close it; another note closes it", () =>
  withSheet(({ hub, sheet, bar, editor, section, left }) => {
    hub.show(ctx(), 2);
    hub.focus();
    assertTrue(isOpen(sheet), ":hub opens the sheet");
    assertTrue(section.contains(document.activeElement), "and puts the focus in the rows");
    assertEqual(bar.querySelector(".sheet__caret").textContent, "▾");
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assertTrue(!isOpen(sheet) && left() === 1, "Escape closes it, back to the text");
    bar.click();
    assertTrue(isOpen(sheet), "a click on the bar opens it");
    bar.click();
    assertTrue(!isOpen(sheet), "and again closes it");
    hub.focus();
    focusOn(editor);
    assertTrue(!isOpen(sheet), "the focus in the text closes it");
    hub.focus();
    const outside = document.createElement("button");
    document.body.append(outside);
    focusOn(outside);
    assertTrue(isOpen(sheet), "a dialog outside the page (on <body>) keeps it open");
    outside.remove();
    hub.show(ctx(), 3);
    assertTrue(!isOpen(sheet), "another note opens with the sheet closed");
  }));

test("section sheet: Tab onto the bar opens it into the rows; Shift-Tab back onto it closes it", () =>
  withSheet(({ hub, sheet, bar, section }) => {
    hub.show(ctx(), 2);
    focusOn(bar);
    assertTrue(isOpen(sheet) && section.contains(document.activeElement), "focus on the bar goes on into the rows");
    focusOn(bar);
    assertTrue(!isOpen(sheet) && document.activeElement === bar, "back from the rows: closed, the focus stays on the bar");
  }));
