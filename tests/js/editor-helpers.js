// Helpers for editor tests: "|" in a string marks the cursor.
//   run("foo |bar baz", "dw") === "foo |baz"
import { parseKeys } from "../../static/js/editor/key-names.js";
import { Vim } from "../../static/js/editor/vim.js";

export function vimAt(textWithCursor, setup = {}) {
  const index = textWithCursor.indexOf("|");
  const text = textWithCursor.slice(0, index) + textWithCursor.slice(index + 1);
  const vim = new Vim({ text, ...setup });
  const before = textWithCursor.slice(0, index).split("\n");
  vim.cursor = { line: before.length - 1, col: before[before.length - 1].length };
  vim.want = vim.cursor.col;
  return vim;
}

export function type(vim, keys) {
  for (const key of parseKeys(keys)) vim.feed(key);
  return vim;
}

export function show(vim) {
  const lines = vim.buf.lines.slice();
  const { line, col } = vim.cursor;
  lines[line] = lines[line].slice(0, col) + "|" + lines[line].slice(col);
  return lines.join("\n");
}

export function run(start, keys, setup) {
  return show(type(vimAt(start, setup), keys));
}
