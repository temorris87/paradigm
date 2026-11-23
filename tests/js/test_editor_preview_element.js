// Live preview in a real page: rendered units, links, clicks, and nodes kept across redraws.
import "../../static/js/editor/pd-editor.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// The editor sizes itself once its stylesheets load; until then it is one row tall.
async function withEditor(text, body) {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  editor.value = text;
  try {
    for (let tries = 0; editor.vim.view.height < 8 && tries < 100; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    body(editor, editor.shadowRoot);
  } finally {
    editor.remove();
  }
}

function press(editor, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true });
  editor.shadowRoot.querySelector(".pd-input").dispatchEvent(event);
}

function mouseDown(target) {
  const box = target.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: box.left + 2, clientY: box.top + box.height / 2 };
  target.dispatchEvent(new MouseEvent("mousedown", init));
}

const units = (root) => [...root.querySelectorAll(".pd-text .pd-unit")];
const unitOn = (root, line) => units(root).find((unit) => unit.dataset.line === String(line));
const lines = (root) => units(root).map((unit) => unit.dataset.line).join(" ");
const marked = (root) => [...root.querySelectorAll(".pd-unit--cursor")].map((unit) => unit.dataset.line).join(" ");
const SAMPLE = "# Title\n\nSee [Acme](https://acme.example) and [the end](#md-end).\n\n- one\n- two\n\n## End";

test("preview element: normal mode renders every block and marks the cursor's; insert shows it raw", () => withEditor(SAMPLE, (editor, root) => {
  assertEqual(lines(root), "0 2 4 5 7");
  assertEqual(marked(root), "0", "the heading under the cursor is marked");
  assertTrue(unitOn(root, 2).querySelector("p") !== null);
  press(editor, "j");
  assertEqual(marked(root), "", "a blank line: no block marked");
  press(editor, "j");
  assertEqual(marked(root), "2", "the mark moves with the cursor; the reused node lost it");
  press(editor, "i");
  assertEqual(lines(root), "0 4 5 7", "insert mode: the cursor's block is raw");
  assertEqual(marked(root), "");
  press(editor, "Escape");
  assertEqual(lines(root), "0 2 4 5 7");
  assertEqual(marked(root), "2");
}));

test("preview element: a sub-bullet is drawn at its depth, right under its parent", () => withEditor("- a\n\n- Scope\n  - in: reports\n  - out", (editor, root) => {
  // A loose list (a blank line between items): an item's text is a paragraph, and its
  // sub-bullets still sit right under it.
  const parent = unitOn(root, 2).querySelector("li");
  const sub = unitOn(root, 3).querySelector(".md-nest-li li");
  assertTrue(sub !== null, "drawn inside its parent's list");
  const gap = unitOn(root, 3).getBoundingClientRect().top - unitOn(root, 2).getBoundingClientRect().bottom;
  assertTrue(Math.abs(gap) < 1, `gap ${gap}px between an item and its sub-bullet`);
  const indent = sub.getBoundingClientRect().left - parent.getBoundingClientRect().left;
  assertTrue(indent > 10, `sub-bullet indented ${indent}px`);
}));

test("preview element: links open in a new tab and are skipped by Tab", () => withEditor(SAMPLE, (editor, root) => {
  const link = unitOn(root, 2).querySelector('a[href^="https:"]');
  assertEqual(link.target, "_blank");
  assertEqual(link.rel, "noopener noreferrer");
  assertEqual(link.tabIndex, -1);
}));

test("preview element: a # link moves the cursor to its heading", () => withEditor(SAMPLE, (editor, root) => {
  mouseDown(unitOn(root, 2).querySelector('a[href="#md-end"]'));
  assertEqual(editor.vim.cursor.line, 7);
}));

test("preview element: clicking a rendered block puts the cursor on its first line", () => withEditor(SAMPLE, (editor, root) => {
  mouseDown(unitOn(root, 5));
  assertEqual(editor.vim.cursor.line, 5);
  assertEqual(lines(root), "0 2 4 5 7", "it stays rendered");
  assertEqual(marked(root), "5");
}));

test("preview element: a block's node is kept while the cursor moves elsewhere", () => withEditor(SAMPLE, (editor, root) => {
  const node = units(root)[3];
  press(editor, "j");
  press(editor, "j");
  assertTrue(units(root).includes(node), "same node after redraws");
}));

test("preview element: :set nopreview and syntax=plain show raw text", () => withEditor(SAMPLE, (editor, root) => {
  for (const key of ":set nopreview") press(editor, key);
  press(editor, "Enter");
  assertEqual(units(root).length, 0);
  for (const key of ":set preview") press(editor, key);
  press(editor, "Enter");
  assertEqual(units(root).length, 5);
  editor.setAttribute("syntax", "plain");
  assertEqual(units(root).length, 0);
}));

const MATHS = "Intro\n\n$$\n\\frac{a}{b}\n\\\\\nc\n$$\n\nInline $x^2$ here.";

test("preview element: maths renders, and is raw under the cursor in insert mode", () => withEditor(MATHS, (editor, root) => {
  const block = units(root).find((unit) => unit.dataset.line === "2");
  assertTrue(block.querySelector(".katex-display") !== null, "display maths drawn");
  assertTrue(units(root).find((unit) => unit.dataset.line === "8").querySelector(".katex") !== null, "inline maths drawn");
  for (const key of "3ji") press(editor, key);
  assertTrue(!units(root).some((unit) => unit.dataset.line === "2"), "the block is raw under the cursor");
  assertTrue(root.querySelector(".pd-text .md-math") !== null, "raw maths coloured");
}));

test("preview element: a maths block's height is measured as drawn", () => withEditor(MATHS, (editor, root) => {
  const block = units(root).find((unit) => unit.dataset.line === "2");
  const drawn = block.getBoundingClientRect().height;
  const measured = editor.previewLayout.unitAt(editor.vim, 2).rows * editor.view.rowHeight;
  assertTrue(drawn > editor.view.rowHeight * 2, `drawn height ${drawn}`);
  assertTrue(Math.abs(measured - drawn) < 1, `measured ${measured}px, drawn ${drawn}px`);
}));

test("preview element: clicking an image sends it to the host and leaves the cursor", () => withEditor("# Title\n\n![Chart one](/no-such-image.png)\n\n[![In a link](/x.png)](https://acme.example)", (editor, root) => {
  const seen = [];
  editor.addEventListener("image", (event) => seen.push(event.detail));
  const [image, linked] = root.querySelectorAll(".pd-unit img");
  mouseDown(image);
  assertEqual(seen.length, 1);
  assertEqual(seen[0].alt, "Chart one");
  assertEqual(seen[0].src, new URL("/no-such-image.png", location.href).href);
  assertEqual(editor.vim.cursor.line, 0, "the cursor stays");
  mouseDown(linked);
  assertEqual(seen.length, 1, "an image inside a link is the link's");
}));
