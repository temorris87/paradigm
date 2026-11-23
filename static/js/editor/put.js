// p / P / gp / gP, and replacing a visual selection with a register.
import { EditorError } from "./errors.js";
import { endAfter, firstNonBlankCol, pos } from "./position.js";
import { putTable, tableMayGoHere } from "./table-edit.js";
import { pasteAsTable } from "./table-paste.js";

function registerValue(vim, register) {
  const name = register ?? '"';
  const value = vim.registers.get(name);
  if (!value) throw new EditorError(`E353: Nothing in register ${name}`);
  return value;
}

export function put(vim, { register = null, count = 1, before = false, moveAfter = false }) {
  const value = registerValue(vim, register);
  if (putClipboardTable(vim, register, value, count, before)) return;
  if (value.type === "line") putLines(vim, value.text, count, before, moveAfter);
  else if (value.type === "block") putBlock(vim, value.text, count, before);
  else putChars(vim, value.text, count, before, moveAfter);
}

// "+p of cells copied from Excel, Word or a web page: a table (below the line; P above it).
function putClipboardTable(vim, register, value, count, before) {
  if ((register !== "+" && register !== "*") || value.type === "block" || count !== 1) return false;
  const table = pasteAsTable(value.text);
  if (!table) return false;
  const line = before && vim.cursor.line > 0 ? vim.cursor.line - 1 : vim.cursor.line;
  if (!tableMayGoHere(vim, line)) return false;
  vim.setCursor(pos(line, 0));
  putTable(vim, table);
  return true;
}

function putLines(vim, text, count, before, moveAfter) {
  const lines = Array(count).fill(text).join("\n");
  const line = vim.cursor.line;
  let first;
  if (before) {
    vim.edit(pos(line, 0), pos(line, 0), `${lines}\n`);
    first = line;
  } else {
    const length = vim.buf.lineLength(line);
    vim.edit(pos(line, length), pos(line, length), `\n${lines}`);
    first = line + 1;
  }
  landOnLines(vim, first, lines.split("\n").length, moveAfter);
}

function landOnLines(vim, first, added, moveAfter) {
  if (moveAfter) vim.setCursor(pos(Math.min(first + added, vim.buf.lastLine), 0));
  else vim.setCursor(pos(first, firstNonBlankCol(vim.buf.line(first))));
}

function putChars(vim, text, count, before, moveAfter) {
  const all = text.repeat(count);
  const { line, col } = vim.cursor;
  const at = pos(line, before || vim.buf.lineLength(line) === 0 ? col : col + 1);
  vim.edit(at, at, all);
  const end = endAfter(at, all);
  if (moveAfter) vim.setCursor(end);
  else if (all.includes("\n")) vim.setCursor(at);
  else vim.setCursor(pos(line, Math.max(at.col, end.col - 1)));
}

function putBlock(vim, rows, count, before) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const { line: top, col: cursorCol } = vim.cursor;
  const col = before || vim.buf.lineLength(top) === 0 ? cursorCol : cursorCol + 1;
  rows.forEach((row, index) => {
    const line = top + index;
    if (line > vim.buf.lastLine) {
      const last = vim.buf.lastLine;
      vim.edit(pos(last, vim.buf.lineLength(last)), pos(last, vim.buf.lineLength(last)), "\n");
    }
    const length = vim.buf.lineLength(line);
    const padding = " ".repeat(Math.max(0, col - length));
    let piece = row.padEnd(width).repeat(count);
    if (col >= length) piece = piece.replace(/ +$/, "");
    const at = pos(line, Math.min(col, length));
    vim.edit(at, at, padding + piece);
  });
  vim.setCursor(pos(top, col));
}

/**
 * Replace the deleted selection `region` with a register value that was read before the
 * delete. The cursor sits where the selection started.
 */
export function putOverRegion(vim, region, value, count) {
  const buf = vim.buf;
  const asLines = value.type === "line" || (region.kind === "line" && value.type === "char");
  if (value.type === "block") {
    vim.setCursor(region.kind === "line" ? pos(region.first, 0) : vim.cursor);
    putBlock(vim, value.text, count, true);
    return;
  }
  const text = Array(count).fill(value.text).join(asLines ? "\n" : "");
  if (region.kind === "line") {
    if (buf.lineCount === 1 && buf.lineLength(0) === 0) {
      vim.edit(pos(0, 0), pos(0, 0), text);
      landOnLines(vim, 0, 0, false);
    } else if (region.first > buf.lastLine) {
      const last = buf.lastLine;
      vim.edit(pos(last, buf.lineLength(last)), pos(last, buf.lineLength(last)), `\n${text}`);
      landOnLines(vim, last + 1, 0, false);
    } else {
      vim.edit(pos(region.first, 0), pos(region.first, 0), `${text}\n`);
      landOnLines(vim, region.first, 0, false);
    }
    return;
  }
  const at = region.kind === "block" ? pos(region.top, region.left) : region.start;
  if (asLines) {
    vim.edit(at, at, `\n${text}\n`);
    landOnLines(vim, at.line + 1, 0, false);
    return;
  }
  vim.edit(at, at, text);
  const end = endAfter(at, text);
  vim.setCursor(text.includes("\n") ? at : pos(at.line, Math.max(at.col, end.col - 1)));
}
