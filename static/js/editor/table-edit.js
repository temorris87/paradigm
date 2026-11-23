// Tables in the editor: what tables.js works out, applied to the text through vim.edit, so
// each change lands in the open undo step and moves the marks. No DOM.
//
//   tableHere(vim)             -> { first, last, lines, column } at the cursor, or null
//   moveCell(vim, how)         insert mode: "next" (Tab), "prev" (Shift-Tab), "down" (Enter),
//                              "up" (Shift-Enter)
//   realignAt(vim, line)       line the table up; the cursor stays on its text in its cell
//   insertTable(vim, cols, rows) / sortTable(vim, arg, bang) / alignColumn(vim, how) / copyTable(vim)
//   tableInfo(vim)             what the host's menu needs: { column, title, columns } or null
//   putTable(vim, lines, { insert })   pasted cells as a table below the cursor's line
import { EditorError } from "./errors.js";
import { pos } from "./position.js";
import { tableClip } from "./table-copy.js";
import { alignTable, cellAt, cellsOf, cellStart, columnNamed, columnTitle, emptyRow, inFence, isSeparatorRow,
  isTableLine, newTableLines, setColumnAlign, sortRows, tableRange } from "./tables.js";

export function tableHere(vim, line = vim.cursor.line) {
  if (!isTableLine(vim.buf.lines, line)) return null;
  const { first, last } = tableRange(vim.buf.lines, line);
  return { first, last, lines: vim.buf.lines.slice(first, last + 1), column: cellAt(vim.buf.line(line), vim.cursor.col) };
}

function requireTable(vim) {
  const table = tableHere(vim);
  if (!table) throw new EditorError("Not in a table");
  return table;
}

// The table's lines become `lines` (one edit, only when they differ).
function replaceTable(vim, { first, last }, lines) {
  const old = vim.buf.lines.slice(first, last + 1);
  if (old.length === lines.length && old.every((text, index) => text === lines[index])) return;
  vim.edit(pos(first, 0), pos(last, vim.buf.lineLength(last)), lines.join("\n"));
}

function toCell(vim, line, cell) {
  vim.setCursor(pos(line, cellStart(vim.buf.line(line), cell)));
}

/** Line the table at `line` up, keeping the cursor on the same character of its cell. */
export function realignAt(vim, line = vim.cursor.line) {
  const table = tableHere(vim, line);
  if (!table) return;
  const cursor = vim.cursor;
  const onTable = cursor.line >= table.first && cursor.line <= table.last;
  const text = vim.buf.line(cursor.line);
  const cell = onTable ? cellAt(text, cursor.col) : 0;
  const offset = onTable ? Math.max(0, cursor.col - cellStart(text, cell)) : 0;
  const aligned = alignTable(table.lines);
  replaceTable(vim, table, aligned);
  if (!onTable) return;
  const now = vim.buf.line(cursor.line);
  const start = cellStart(now, cell);
  const length = (cellsOf(now)[cell] ?? "").length;
  vim.setCursor(pos(cursor.line, start + Math.min(offset, length)));
}

// The next (dir 1) or previous (-1) row that isn't the |---| line, inside first..last, or -1.
function nextRow(vim, line, dir, first, last) {
  for (let at = line + dir; at >= first && at <= last; at += dir) {
    if (!isSeparatorRow(vim.buf.line(at))) return at;
  }
  return -1;
}

function addRow(vim, last, count) {
  const end = pos(last, vim.buf.lineLength(last));
  vim.edit(end, end, `\n${emptyRow(vim.buf.line(last), count)}`);
  realignAt(vim, last + 1);
  return last + 1;
}

/** Tab, Shift-Tab, Enter and Shift-Enter on a table row in insert mode. */
export function moveCell(vim, how) {
  const line = vim.cursor.line;
  const cell = cellAt(vim.buf.line(line), vim.cursor.col);
  realignAt(vim, line);
  const { first, last } = tableRange(vim.buf.lines, line);
  const count = cellsOf(vim.buf.line(line)).length;
  const here = Math.min(cell, count - 1);
  if (how === "next") {
    if (here + 1 < count) return toCell(vim, line, here + 1);
    const below = nextRow(vim, line, 1, first, last);
    return toCell(vim, below < 0 ? addRow(vim, last, count) : below, 0);
  }
  if (how === "prev") {
    if (here > 0) return toCell(vim, line, here - 1);
    const above = nextRow(vim, line, -1, first, last);
    return above < 0 ? toCell(vim, line, 0) : toCell(vim, above, count - 1);
  }
  if (how === "down") {
    const below = nextRow(vim, line, 1, first, last);
    return toCell(vim, below < 0 ? addRow(vim, last, count) : below, here);
  }
  const above = nextRow(vim, line, -1, first, last);
  return toCell(vim, above < 0 ? line : above, here);
}

// New lines below `line`: a blank line first when that line has text, and one after when the
// next line has text (a line right under a table would join it).
function linesBelow(vim, line, lines, { trailing = false } = {}) {
  const above = vim.buf.line(line).trim() !== "";
  const below = line < vim.buf.lastLine && vim.buf.line(line + 1).trim() !== "";
  const block = [...(above ? [""] : []), ...lines, ...(below || trailing ? [""] : [])];
  if (above) {
    const end = pos(line, vim.buf.lineLength(line));
    vim.edit(end, end, `\n${block.join("\n")}`);
    return line + 2;
  }
  // An empty line becomes the table's first line.
  vim.edit(pos(line, 0), pos(line, vim.buf.lineLength(line)), block.join("\n"));
  return line;
}

/** :table [cols [rows]]: an empty table below the cursor, insert mode in its first cell. */
export function insertTable(vim, columns = 3, rows = 2) {
  vim.checkWritable();
  if (tableHere(vim)) throw new EditorError("Already in a table");
  const cols = clampCount(columns, 3);
  const height = clampCount(rows, 2);
  const top = linesBelow(vim, vim.cursor.line, newTableLines(cols, height));
  vim.startInsert(pos(top, cellStart(vim.buf.line(top), 0)));
}

function clampCount(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, 50) : fallback;
}

/** Pasted cells (lines from pasteAsTable) below the cursor's line. In insert mode the cursor
 * goes to an empty line under the table; in normal mode onto its first row. */
export function putTable(vim, lines, { insert = false } = {}) {
  const top = linesBelow(vim, vim.cursor.line, lines, { trailing: insert });
  if (insert) vim.setCursor(pos(top + lines.length, 0));
  else toCell(vim, top, 0);
}

/** Pasted text may become a table here: not in a code fence, not on a table row. */
export function tableMayGoHere(vim, line = vim.cursor.line) {
  const lines = vim.buf.lines;
  return !inFence(lines, line) && !isTableLine(lines, line);
}

/** :tsort[!] [column]: sort the rows under the header; a column by number or header name. */
export function sortTable(vim, arg = "", down = false) {
  vim.checkWritable();
  const table = requireTable(vim);
  let column = table.column;
  if (String(arg).trim()) {
    column = columnNamed(table.lines, arg);
    if (column < 0) throw new EditorError(`No column "${String(arg).trim()}" in this table`);
  }
  if (column >= cellsOf(table.lines[0]).length) throw new EditorError(`No column ${column + 1} in this table`);
  const { lines, dir } = sortRows(table.lines, column, down ? -1 : 0);
  const line = vim.cursor.line;
  replaceTable(vim, table, alignTable(lines));
  toCell(vim, line, column);
  const title = columnTitle(lines, column) || `column ${column + 1}`;
  vim.say(`Sorted by ${title}, ${dir > 0 ? "up" : "down"}`);
}

/** :talign left|center|right: the cursor's column. */
export function alignColumn(vim, how) {
  vim.checkWritable();
  const word = String(how ?? "").trim().toLowerCase().replace(/^centre$/, "center");
  if (!["left", "center", "right"].includes(word)) throw new EditorError("Align left, center or right");
  const table = requireTable(vim);
  const { lines, added } = setColumnAlign(table.lines, table.column, word);
  const line = vim.cursor.line;
  replaceTable(vim, table, lines);
  // A separator put in under the first row pushes the rows below it down one.
  const at = added && line > table.first ? line + 1 : line;
  toCell(vim, isSeparatorRow(vim.buf.line(at)) ? at + 1 : at, table.column);
  vim.say(`Column ${table.column + 1} ${word}`);
}

/** :tcopy: the host puts it on the clipboard (a "copytable" event). */
export function copyTable(vim) {
  const table = requireTable(vim);
  const clip = tableClip(table.lines);
  vim.emit("copytable", { ...clip, message: `Table copied (${clip.columns} column${clip.columns === 1 ? "" : "s"}, ${clip.rows} row${clip.rows === 1 ? "" : "s"})` });
}

export function tableInfo(vim) {
  const table = tableHere(vim);
  if (!table) return null;
  const columns = cellsOf(table.lines[0]).length;
  const column = Math.min(table.column, columns - 1);
  const aligns = table.lines.find(isSeparatorRow);
  const align = aligns ? cellsOf(aligns)[column] ?? "" : "";
  return {
    column,
    columns,
    title: columnTitle(table.lines, column),
    align: /^:-*:$/.test(align) ? "center" : /-:$/.test(align) ? "right" : "left",
  };
}
