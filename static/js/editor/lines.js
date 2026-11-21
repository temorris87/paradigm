// Opening and joining lines, shared by normal and visual mode.
import { EditorError } from "./errors.js";
import { leadingWhitespace, pos } from "./position.js";

/** Open a new line below (or above) the cursor, indented like the current one. */
export function openLine(vim, below) {
  const line = vim.cursor.line;
  const indent = vim.options.autoindent ? leadingWhitespace(vim.buf.line(line)) : "";
  if (below) {
    const length = vim.buf.lineLength(line);
    vim.edit(pos(line, length), pos(line, length), `\n${indent}`);
    return pos(line + 1, indent.length);
  }
  vim.edit(pos(line, 0), pos(line, 0), `${indent}\n`);
  return pos(line, indent.length);
}

/** J and gJ: join `count` lines (at least two) starting at `line`. */
export function joinLines(vim, line, count, raw) {
  const joins = Math.max(1, count - 1);
  if (line >= vim.buf.lastLine) throw new EditorError("");
  let col = 0;
  for (let step = 0; step < joins && line < vim.buf.lastLine; step += 1) {
    const current = vim.buf.line(line);
    const next = vim.buf.line(line + 1);
    if (raw) {
      vim.edit(pos(line, current.length), pos(line + 1, 0), "");
      col = current.length;
      continue;
    }
    const trimmed = next.replace(/^[ \t]+/, "");
    let separator = " ";
    if (trimmed === "" || current === "" || /[ \t]$/.test(current) || trimmed.startsWith(")")) separator = "";
    vim.edit(pos(line, current.length), pos(line + 1, next.length - trimmed.length), separator);
    col = current.length;
  }
  vim.setCursor(pos(line, col));
}
