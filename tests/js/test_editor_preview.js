// Live preview without a page: units, which of them show raw, and scrolling past rendered
// blocks of any height. A fake measure makes a unit one row per line of its HTML, plus one.
import { PreviewLayout } from "../../static/js/editor/preview-layout.js";
import { buildUnits } from "../../static/js/editor/preview-units.js";
import { bottomLine } from "../../static/js/editor/view.js";
import { Vim } from "../../static/js/editor/vim.js";
import { assertEqual, assertTrue, test } from "./harness.js";
import { type } from "./editor-helpers.js";

const fakeMeasure = { generation: 1, rows: (html) => html.split("\n").length + 1 };

function previewVim(text, { height = 5, width = 40 } = {}) {
  const vim = new Vim({ text });
  vim.layout = new PreviewLayout({ measure: fakeMeasure });
  vim.resize(height, width);
  return vim;
}

const rendered = (vim, line) => vim.layout.unitAt(vim, line).rendered;
const starts = (text) => buildUnits(text, text.split("\n").length).units.map((unit) => `${unit.start}-${unit.end}`).join(" ");

test("preview: lists split into their items, nested ones too", () => {
  const text = "# H\n\n- a\n- b\n  - c\n\n1. x\n2. y";
  assertEqual(starts(text), "0-0 2-2 3-3 4-4 6-6 7-7");
  const { units } = buildUnits(text, 8);
  assertTrue(units[2].html().includes("<li>b"));
  assertTrue(!units[2].html().includes("<li>c"), "a sub-bullet is not part of its parent's unit");
  assertEqual(units[3].html(), '<ul class="md-nest">\n<li class="md-nest-li">\n<ul>\n<li>c</li>\n</ul>\n</li>\n</ul>', "drawn inside its parent's list");
  assertTrue(units[4].html().startsWith("<ol>"), "first item keeps number 1");
  assertTrue(units[5].html().startsWith('<ol start="2">'), "second item keeps its number");
});

test("preview: nested items keep their number, their list kind and their depth", () => {
  const text = "1. a\n   1. x\n   2. y\n      - deep\n2. b";
  assertEqual(starts(text), "0-0 1-1 2-2 3-3 4-4");
  const { units } = buildUnits(text, 5);
  assertTrue(units[2].html().startsWith('<ol class="md-nest">\n<li class="md-nest-li">\n<ol start="2">'));
  assertEqual(units[3].html().split('class="md-nest"').length - 1, 2, "two lists above it");
});

test("preview: a loose item's unit ends with its text, before the blank line", () => {
  assertEqual(starts("- a\n\n  - b\n\n- c"), "0-0 2-2 4-4");
});

test("preview: an item with more than sub-lists under it stays whole", () => {
  assertEqual(starts("- a\n  - b\n\n  more of a\n- c"), "0-3 4-4");
});

test("preview: blank lines and loose items stay outside or inside units as in the source", () => {
  assertEqual(starts("para\nmore\n\n- a\n\n  still a\n- b"), "0-1 3-5 6-6");
});

test("preview: normal mode keeps the cursor's unit rendered; insert and replace show it raw", () => {
  const vim = previewVim("# Title\n\nSome text\nmore\n\n- item");
  assertEqual(rendered(vim, 0), true);
  assertEqual(rendered(vim, 2), true);
  assertEqual(vim.layout.unitAt(vim, 3).start, 2, "a unit covers all its lines");
  type(vim, "3Gi");
  assertEqual(rendered(vim, 0), true);
  assertEqual(rendered(vim, 2), false);
  assertEqual(rendered(vim, 3), false);
  type(vim, "<Esc>");
  assertEqual(rendered(vim, 2), true, "Escape renders it again");
  type(vim, "R");
  assertEqual(rendered(vim, 2), false, "replace mode");
  type(vim, "<Esc>:");
  assertEqual(rendered(vim, 2), true, "a : command from normal mode");
});

test("preview: in insert mode only the sub-bullet being typed in turns raw", () => {
  const vim = previewVim("- a\n  - b\n  - c");
  type(vim, "2GA");
  assertEqual([0, 1, 2].map((line) => rendered(vim, line)).join(" "), "true false true");
});

test("preview: blank lines are always raw", () => {
  const vim = previewVim("a\n\nb");
  assertEqual(rendered(vim, 1), false);
  assertEqual(rendered(vim, 2), true);
});

test("preview: a visual selection keeps every unit it touches raw", () => {
  const vim = previewVim("one\n\ntwo\n\nthree");
  type(vim, "Vjj");
  assertEqual(rendered(vim, 2), false);
  assertEqual(rendered(vim, 4), true);
  type(vim, ":");
  assertEqual(rendered(vim, 2), false, "still raw while : is typed from visual mode");
});

test("preview: incsearch shows its match raw", () => {
  const vim = previewVim("one\n\ntwo\n\nthree");
  type(vim, "/thr");
  assertEqual(rendered(vim, 4), false);
  type(vim, "<Esc>");
  assertEqual(rendered(vim, 4), true);
});

test("preview: a block that renders to nothing stays raw", () => {
  const vim = previewVim("x[^n]\n\n[^n]: note");
  assertEqual(rendered(vim, 2), false);
});

test("preview: :set nopreview shows everything raw", () => {
  const vim = previewVim("a\n\nb");
  type(vim, ":set nopreview<CR>");
  assertEqual(rendered(vim, 2), false);
  type(vim, ":set pv<CR>");
  assertEqual(rendered(vim, 2), true);
});

test("preview: # links resolve to headings and footnotes", () => {
  const vim = previewVim("intro[^n]\n\n## Big Title\n\n[^n]: note");
  assertEqual(vim.layout.anchorLine(vim, "md-big-title"), 2);
  assertEqual(vim.layout.anchorLine(vim, "md-fn-1"), 4);
  assertEqual(vim.layout.anchorLine(vim, "md-nothing"), null);
});

test("preview: the parse is redone only when the text changes", () => {
  const vim = previewVim("a\n\nb");
  const model = vim.layout.modelFor(vim);
  type(vim, "j");
  assertTrue(vim.layout.modelFor(vim) === model);
  type(vim, "ggx");
  assertTrue(vim.layout.modelFor(vim) !== model);
});

// A 5-row screen with a code block 22 rows tall (20 lines of code, the closing tag, plus one).
const CODE = Array.from({ length: 20 }, (_, index) => `c${index}`).join("\n");
const TALL = `top\n\n\`\`\`\n${CODE}\n\`\`\`\n\nend`;
const END_LINE = 25;

const where = (vim) => `top ${vim.view.top} skip ${vim.view.skip} line ${vim.cursor.line}`;

test("preview: the screen fills with rows, rendered units counting their height", () => {
  const vim = previewVim("a\n\nb\n\nc\n\nd", { height: 5 });
  type(vim, "j");
  assertEqual(bottomLine(vim), 2, "line 2 renders 2 rows tall (fake), line 4 no longer fits");
});

test("preview: zb on a line below a tall block shows the block's bottom rows", () => {
  const vim = previewVim(TALL);
  type(vim, "Gzb");
  assertEqual(vim.cursor.line, END_LINE);
  assertEqual(vim.view.top, 2);
  assertTrue(vim.view.skip > 0, "the block is partly scrolled off");
  assertEqual(rendered(vim, 2), true);
});

test("preview: Ctrl-Y from below pulls the cursor into the block, which stays rendered", () => {
  const vim = previewVim(TALL);
  type(vim, "Gzb");
  const shown = vim.view.skip;
  type(vim, "<C-y>");
  assertEqual(rendered(vim, 2), true, "normal mode: still rendered");
  assertEqual(vim.view.top, 2);
  assertEqual(vim.view.skip, shown - 1, "the screen moved up one row");
  assertTrue(vim.cursor.line >= 3 && vim.cursor.line <= 23, `the cursor is in the block, ${where(vim)}`);
});

test("preview: j through a rendered block taller than the screen scrolls with the cursor", () => {
  const vim = previewVim(TALL);
  type(vim, "3G");
  for (let line = 2; line < 23; line += 1) {
    type(vim, "j");
    const unit = vim.layout.unitAt(vim, vim.cursor.line);
    assertTrue(unit.rendered, `line ${vim.cursor.line} rendered`);
    // The fake makes one row per line, so the cursor's row is about its line in the block.
    const row = vim.cursor.line - unit.start - vim.view.skip;
    assertTrue(row >= 0 && row < vim.view.height, `cursor row ${row} off screen, ${where(vim)}`);
  }
});

test("preview: scrolling through the whole note keeps moving and keeps the cursor on screen", () => {
  const vim = previewVim(TALL);
  let previous = -1;
  for (let step = 0; step < 60; step += 1) {
    type(vim, "<C-e>");
    // Rows and lines match one to one in this block, so top + skip is where the screen is.
    const at = vim.view.top + vim.view.skip;
    assertTrue(at >= previous, `step ${step}: went back from ${previous} to ${at}`);
    previous = at;
    // A rendered block can hold the cursor while only part of it shows.
    const inBlock = vim.layout.unitAt(vim, vim.cursor.line).rendered;
    assertTrue(vim.cursor.line >= vim.view.top && (inBlock || vim.cursor.line <= bottomLine(vim)), `step ${step}: cursor off screen, ${where(vim)}`);
  }
  // As before live preview, Ctrl-E stops with scrolloff lines above the cursor on the last line.
  assertEqual(vim.cursor.line, END_LINE);
  assertEqual(where(vim), "top 2 skip 21 line 25");
});

test("preview: the wheel scrolls rows and G, gg land where expected", () => {
  const vim = previewVim(TALL);
  type(vim, "G");
  assertEqual(vim.cursor.line, END_LINE);
  assertTrue(vim.cursor.line <= bottomLine(vim));
  type(vim, "gg");
  assertEqual(where(vim), "top 0 skip 0 line 0");
  vim.scrollView(1);
  assertEqual(where(vim), "top 0 skip 1 line 2", "the first line renders two rows tall (fake)");
});

test("preview: a top line inside a block that turns rendered moves to the block's start", () => {
  const vim = previewVim(TALL);
  type(vim, "7Gzt");
  assertEqual(vim.view.top, 2, "the code block stays rendered: zt puts it at the top");
  type(vim, "G");
  assertTrue(vim.view.top <= END_LINE && vim.cursor.line === END_LINE);
  vim.view.top = 6;
  vim.view.skip = 0;
  vim.relayout();
  assertEqual(vim.view.top, 2, "now on the rendered block's first line");
  assertTrue(vim.view.skip > 0, "scrolled into it by the same share");
});
