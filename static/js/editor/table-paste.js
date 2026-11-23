// Cells copied from Excel, Word or a web page arrive as text: one row per line, cells split by
// Tab. Excel puts a cell holding a Tab, a newline or a quote in "quotes", with "" for a quote.
// pasteAsTable turns such text into the lines of a Markdown table, or says no (null).
//
//   cellsFromPaste(text) -> [[cell, ...], ...]
//   pasteAsTable(text)   -> [line, ...] | null
import { alignTable, sortKey } from "./tables.js";

/** The rows of cells in tab-split text. */
export function cellsFromPaste(text) {
  const source = String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const rows = [[]];
  let at = 0;
  for (;;) {
    let cell;
    const quotedEnd = source[at] === '"' ? closingQuote(source, at) : -1;
    if (quotedEnd > 0) {
      cell = source.slice(at + 1, quotedEnd).replace(/""/g, '"');
      at = quotedEnd + 1;
    } else {
      let end = at;
      while (end < source.length && source[end] !== "\t" && source[end] !== "\n") end += 1;
      cell = source.slice(at, end);
      at = end;
    }
    rows[rows.length - 1].push(cell);
    if (at >= source.length) break;
    if (source[at] === "\n") rows.push([]);
    at += 1;
  }
  return rows;
}

// The closing quote of a quoted cell starting at `at`, when a Tab, a newline or the end follows
// it; else -1 (a cell that merely starts with a quote).
function closingQuote(source, at) {
  let index = at + 1;
  while (index < source.length) {
    if (source[index] === '"') {
      if (source[index + 1] === '"') {
        index += 2;
        continue;
      }
      const next = source[index + 1];
      return next === undefined || next === "\t" || next === "\n" ? index : -1;
    }
    index += 1;
  }
  return -1;
}

/**
 * The paste as a Markdown table, or null when it isn't cells: it needs two rows or more,
 * every row split by a Tab, and a Tab after some text (tab-indented code stays as it is).
 */
export function pasteAsTable(text) {
  const source = String(text ?? "");
  if (!/[^\s]\t/.test(source)) return null;
  let rows = cellsFromPaste(source).map((row) => row.map(cleanCell)).filter((row) => row.some(Boolean));
  if (rows.length < 2 || rows.some((row) => row.length < 2)) return null;
  const width = usedWidth(rows);
  if (width < 2) return null;
  rows = rows.map((row) => [...row.slice(0, width), ...Array(Math.max(0, width - row.length)).fill("")]);
  const separator = rows[0].map((_, column) => (isNumberColumn(rows.slice(1), column) ? "---:" : "---"));
  const lines = [rows[0], separator, ...rows.slice(1)].map((row) => `| ${row.join(" | ")} |`);
  return alignTable(lines);
}

// One line, trimmed, a pipe escaped so it stays inside the cell.
function cleanCell(cell) {
  return cell.replace(/\s*\n\s*/g, " ").replace(/\t/g, " ").trim().replace(/\|/g, "\\|");
}

// Columns up to the last one with something in it.
function usedWidth(rows) {
  let width = 0;
  for (const row of rows) {
    row.forEach((cell, index) => {
      if (cell) width = Math.max(width, index + 1);
    });
  }
  return width;
}

function isNumberColumn(body, column) {
  const keys = body.map((row) => sortKey(row[column] ?? "")).filter((key) => key.kind !== 2);
  return keys.length > 0 && keys.every((key) => key.kind === 0);
}
