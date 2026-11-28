// Scrolling and screen-relative motions, on a 5-row, 10-column screen.
import { Vim } from "../../static/js/editor/vim.js";
import { assertEqual, test } from "./harness.js";
import { type } from "./editor-helpers.js";

function screen(lines = 20, text = null) {
  const vim = new Vim({ text: text ?? Array.from({ length: lines }, (_, index) => `l${index}`).join("\n") });
  vim.resize(5, 10); // scrolloff 3 is cut to 2 on a 5-row screen
  return vim;
}

const where = (vim) => `top ${vim.view.top} line ${vim.cursor.line}`;

test("view: moving down scrolls to keep scrolloff lines below the cursor", () => {
  const vim = type(screen(), "2j");
  assertEqual(where(vim), "top 0 line 2");
  type(vim, "j");
  assertEqual(where(vim), "top 1 line 3");
  type(vim, "10j");
  assertEqual(where(vim), "top 11 line 13");
  type(vim, "gg");
  assertEqual(where(vim), "top 0 line 0");
  type(vim, "G");
  assertEqual(where(vim), "top 15 line 19");
});

test("view: Ctrl-D and Ctrl-U scroll half a screen and move the cursor", () => {
  const vim = type(screen(), "<C-d>");
  assertEqual(where(vim), "top 2 line 4");
  type(vim, "<C-d>");
  assertEqual(where(vim), "top 4 line 6");
  type(vim, "<C-u>");
  assertEqual(where(vim), "top 2 line 4");
  type(vim, "3<C-d>");
  assertEqual(where(vim), "top 5 line 7");
});

test("view: Ctrl-D stops scrolling once the last line shows", () => {
  const vim = type(screen(), "G<C-u><C-d><C-d>");
  assertEqual(where(vim), "top 15 line 19");
  assertEqual(vim.bellCount, 0);
  type(vim, "<C-d>");
  assertEqual(vim.bellCount, 1);
});

test("view: Ctrl-F, Ctrl-B, Ctrl-E and Ctrl-Y", () => {
  const vim = type(screen(), "<C-f>");
  assertEqual(where(vim), "top 3 line 5");
  type(vim, "<C-b>");
  assertEqual(where(vim), "top 0 line 2");
  type(vim, "<C-e>");
  assertEqual(where(vim), "top 1 line 3");
  type(vim, "<C-y>");
  assertEqual(where(vim), "top 0 line 2");
  type(vim, "<C-y>");
  assertEqual(vim.view.top, 0);
});

test("view: zt, zz and zb place the cursor line", () => {
  const vim = type(screen(), "10G");
  type(vim, "zt");
  assertEqual(where(vim), "top 7 line 9");
  type(vim, "zz");
  assertEqual(where(vim), "top 7 line 9");
  type(vim, "zb");
  assertEqual(where(vim), "top 7 line 9");
  type(vim, "jzt");
  assertEqual(where(vim), "top 8 line 10");
});

test("view: H, M and L stay inside the scrolloff margin", () => {
  const vim = type(screen(), "10Gzz");
  assertEqual(vim.view.top, 7);
  type(vim, "H");
  assertEqual(where(vim), "top 7 line 9");
  type(vim, "L");
  assertEqual(where(vim), "top 7 line 9");
  type(vim, "gg");
  type(vim, "H");
  assertEqual(where(vim), "top 0 line 0");
  type(vim, "L");
  assertEqual(where(vim), "top 0 line 2");
  type(vim, "M");
  assertEqual(where(vim), "top 0 line 2");
});

test("view: long lines wrap into rows that count against the screen", () => {
  const vim = screen(0, `${"a".repeat(25)}\nb\nc\nd`);
  type(vim, "j");
  assertEqual(where(vim), "top 0 line 1");
  type(vim, "j");
  assertEqual(where(vim), "top 1 line 2");
});

test("view: gj and gk move by screen rows", () => {
  const vim = screen(0, `${"a".repeat(25)}\nbbbbb`);
  type(vim, "3lgj");
  assertEqual(vim.cursor.col, 13);
  type(vim, "gj");
  assertEqual(vim.cursor.col, 23);
  type(vim, "gj");
  assertEqual(`${vim.cursor.line}:${vim.cursor.col}`, "1:3");
  type(vim, "gk");
  assertEqual(`${vim.cursor.line}:${vim.cursor.col}`, "0:23");
});

test("view: without wrap the screen scrolls sideways", () => {
  const vim = screen(0, "a".repeat(25));
  type(vim, ":set nowrap<CR>$");
  assertEqual(vim.view.left, 15);
  type(vim, "0");
  assertEqual(vim.view.left, 0);
});

test("view: the mouse wheel scrolls and drags the cursor along", () => {
  const vim = screen();
  vim.scrollView(3);
  assertEqual(where(vim), "top 3 line 5");
});

test("view: a click moves the cursor and ends visual mode", () => {
  const vim = type(screen(), "vj");
  vim.click({ line: 3, col: 9 });
  assertEqual(vim.mode, "normal");
  assertEqual(`${vim.cursor.line}:${vim.cursor.col}`, "3:1");
});

test("view: a screen that grows brings back lines above rather than leave rows empty below", () => {
  const vim = type(screen(8), "5j"); // a docked panel takes rows: line 5 pushes the top down
  assertEqual(where(vim), "top 3 line 5");
  vim.resize(20, 10); // the panel closes: all 8 lines fit again
  assertEqual(where(vim), "top 0 line 5");
  const long = type(screen(30), "15j");
  long.resize(8, 10); // text still below: only the scrolloff margin above moves the top
  assertEqual(where(long), "top 12 line 15");
});
