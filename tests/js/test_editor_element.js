// The <pd-editor> element in a real page: keys in, events out, Tab only taken in insert mode.
import "../../static/js/editor/pd-editor.js";
import { assertEqual, assertTrue, test } from "./harness.js";

function makeEditor(text) {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  editor.value = text;
  return editor;
}

function input(editor) {
  return editor.shadowRoot.querySelector(".pd-input");
}

function press(editor, key, mods = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true, ...mods });
  input(editor).dispatchEvent(event);
  return event;
}

function typeText(editor, text) {
  for (const key of text) press(editor, key);
}

function withEditor(text, body) {
  const editor = makeEditor(text);
  try {
    body(editor);
  } finally {
    editor.remove();
  }
}

test("element: keys edit the text and fire change", () => withEditor("foo bar", (editor) => {
  const changes = [];
  editor.addEventListener("change", (event) => changes.push(event.detail.value));
  typeText(editor, "dw");
  assertEqual(editor.value, "bar");
  assertEqual(changes.join("|"), "bar");
}));

test("element: Tab moves focus on outside insert mode", () => withEditor("foo", (editor) => {
  assertTrue(!press(editor, "Tab").defaultPrevented);
  assertTrue(!press(editor, "Tab", { shiftKey: true }).defaultPrevented);
  press(editor, "v");
  assertTrue(!press(editor, "Tab").defaultPrevented, "visual mode");
  press(editor, "Escape");
  press(editor, ":");
  assertTrue(!press(editor, "Tab").defaultPrevented, "command line");
  press(editor, "Escape");
  assertTrue(!press(editor, "Tab", { ctrlKey: true }).defaultPrevented, "Ctrl-Tab belongs to the browser");
  assertEqual(editor.value, "foo");
}));

test("element: Tab and Shift-Tab indent in insert mode", () => withEditor("foo", (editor) => {
  press(editor, "i");
  assertTrue(press(editor, "Tab").defaultPrevented);
  assertEqual(editor.value, "  foo");
  assertTrue(press(editor, "Tab", { shiftKey: true }).defaultPrevented);
  assertEqual(editor.value, "foo");
  press(editor, "Escape");
  assertTrue(!press(editor, "Tab").defaultPrevented);
}));

test("element: bound keys are taken, browser-owned ones are not", () => withEditor("foo", (editor) => {
  assertTrue(press(editor, "x").defaultPrevented);
  assertTrue(press(editor, "r", { ctrlKey: true }).defaultPrevented, "Ctrl-R is redo, not reload");
  assertTrue(!press(editor, "w", { ctrlKey: true }).defaultPrevented);
  assertTrue(!press(editor, "l", { ctrlKey: true }).defaultPrevented);
  assertTrue(!press(editor, "c", { metaKey: true }).defaultPrevented);
}));

test("element: Ctrl-V is visual block in normal mode, the browser's paste in insert mode", () => withEditor("foo", (editor) => {
  assertTrue(press(editor, "v", { ctrlKey: true }).defaultPrevented);
  assertEqual(editor.mode, "visual");
  press(editor, "Escape");
  press(editor, "i");
  assertTrue(!press(editor, "v", { ctrlKey: true }).defaultPrevented);
}));

test("element: a paste event inserts its text", () => withEditor("foo", (editor) => {
  press(editor, "A");
  // Browsers drop clipboardData from synthetic paste events, so hand the handler one.
  let prevented = false;
  editor.onPaste({ preventDefault: () => { prevented = true; }, clipboardData: { getData: () => " bar\r\nbaz" } });
  assertTrue(prevented);
  press(editor, "Escape");
  assertEqual(editor.value, "foo bar\nbaz");
}));

test("element: text from the textarea (dead keys, IME) is typed in", () => withEditor("", (editor) => {
  press(editor, "i");
  input(editor).value = "é";
  input(editor).dispatchEvent(new InputEvent("input", { data: "é", bubbles: true }));
  press(editor, "Escape");
  assertEqual(editor.value, "é");
  assertEqual(input(editor).value, "");
}));

test("element: :w fires save, :q fires quit, mode changes fire mode", () => withEditor("foo", (editor) => {
  const seen = [];
  editor.addEventListener("save", (event) => seen.push(`save:${event.detail.value}`));
  editor.addEventListener("quit", () => seen.push("quit"));
  editor.addEventListener("mode", (event) => seen.push(`mode:${event.detail.mode}`));
  typeText(editor, ":x");
  press(editor, "Enter");
  assertEqual(seen.join(" "), "mode:cmdline save:foo quit mode:normal");
}));

test("element: the status line shows the mode and messages", () => withEditor("foo", (editor) => {
  const status = () => editor.shadowRoot.querySelector(".pd-status").textContent;
  press(editor, "i");
  assertTrue(status().includes("-- INSERT --"), status());
  press(editor, "Escape");
  editor.showMessage("Saved");
  assertTrue(status().includes("Saved"));
  assertTrue(status().includes("1:1"));
}));

test("element: the cursor is drawn, as a bar in insert mode", () => withEditor("foo", (editor) => {
  const root = editor.shadowRoot;
  assertEqual(root.querySelector(".pd-cursor").textContent, "f");
  press(editor, "A");
  assertEqual(root.querySelectorAll(".pd-cursor-bar").length, 1);
}));

test("element: Markdown is coloured unless syntax is plain", () => withEditor("# Title", (editor) => {
  assertTrue(editor.shadowRoot.querySelector(".md-h1") !== null);
  editor.setAttribute("syntax", "plain");
  assertEqual(editor.shadowRoot.querySelector(".md-h1"), null);
}));

test("element: readonly refuses changes", () => withEditor("foo", (editor) => {
  editor.readOnly = true;
  press(editor, "x");
  assertEqual(editor.value, "foo");
  editor.readOnly = false;
  press(editor, "x");
  assertEqual(editor.value, "oo");
}));

test("element: setting value resets the cursor and undo", () => withEditor("foo", (editor) => {
  press(editor, "x");
  editor.value = "new";
  press(editor, "u");
  assertEqual(editor.value, "new");
}));
