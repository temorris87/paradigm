// Markdown tables as lines of text: finding one, its cells, lining its columns up, sorting
// its rows and setting a column's alignment. Pure: lines in, lines out. table-edit.js applies
// the results to the editor; the renderer has its own reading (markdown/tables.js).
//
// A table row is a line that starts and ends with "|" (after its indent). Cells keep "\|" as
// written: it is a pipe inside a cell, never a border.

const ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function isTableRow(text) {
  return ROW.test(text);
}

export function isSeparatorRow(text) {
  return SEPARATOR.test(text);
}

/** True when line `index` of `lines` sits inside a ``` or ~~~ fence. */
export function inFence(lines, index) {
  let open = null;
  for (let line = 0; line < index; line += 1) {
    const match = FENCE.exec(lines[line]);
    if (!match) continue;
    const fence = match[1];
    if (open === null) open = fence;
    else if (fence[0] === open[0] && fence.length >= open.length) open = null;
  }
  return open !== null;
}

/** A table row outside any code fence. */
export function isTableLine(lines, index) {
  return isTableRow(lines[index] ?? "") && !inFence(lines, index);
}

/** { first, last } of the table holding line `index` (a table row). */
export function tableRange(lines, index) {
  let first = index;
  let last = index;
  while (first > 0 && isTableRow(lines[first - 1])) first -= 1;
  while (last < lines.length - 1 && isTableRow(lines[last + 1])) last += 1;
  return { first, last };
}

/** Where each cell's text sits in a row: [{ from, to }] between its borders (spaces included). */
function cellSpans(text) {
  const start = text.indexOf("|");
  const end = text.lastIndexOf("|");
  const spans = [];
  let from = start + 1;
  for (let at = start + 1; at <= end; at += 1) {
    if (text[at] === "\\" && text[at + 1] === "|" && at + 1 < end) {
      at += 1;
    } else if (text[at] === "|") {
      spans.push({ from, to: at });
      from = at + 1;
    }
  }
  return spans;
}

/** The trimmed cell texts of a row ("\|" kept). */
export function cellsOf(text) {
  return cellSpans(text).map(({ from, to }) => text.slice(from, to).trim());
}

/** Which cell column `col` of a row is in (a border counts with the cell before it, so a
 * cursor just after typed text is still in that cell). */
export function cellAt(text, col) {
  const spans = cellSpans(text);
  const index = spans.findIndex(({ to }) => col <= to);
  return index < 0 ? Math.max(0, spans.length - 1) : index;
}

/** The column where cell `cell`'s text starts (after its padding), or one space in when empty. */
export function cellStart(text, cell) {
  const spans = cellSpans(text);
  const span = spans[Math.min(cell, spans.length - 1)];
  if (!span) return text.length;
  const inside = text.slice(span.from, span.to);
  const lead = inside.length - inside.trimStart().length;
  if (inside.trim() === "") return Math.min(span.from + 1, span.to);
  return span.from + lead;
}

/** The alignment of each column ("left", "center", "right"), from the separator row. */
export function columnAligns(lines) {
  const separator = lines.find(isSeparatorRow);
  if (!separator) return [];
  return cellsOf(separator).map((cell) => (/^:-*:$/.test(cell) ? "center" : /-:$/.test(cell) ? "right" : "left"));
}

/** The table's lines with every column padded to its widest cell. */
export function alignTable(lines) {
  const indent = /^\s*/.exec(lines[0])[0];
  const rows = lines.map((text) => ({ separator: isSeparatorRow(text), cells: cellsOf(text) }));
  const count = Math.max(1, ...rows.map((row) => row.cells.length));
  const widths = Array(count).fill(1);
  for (const row of rows) {
    if (row.separator) continue;
    row.cells.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], cell.length);
    });
  }
  const aligns = columnAligns(lines);
  return rows.map(({ separator, cells }) => {
    const full = [...cells, ...Array(count - cells.length).fill("")];
    if (separator) {
      const dashes = full.map((cell, index) => separatorCell(aligns[index] ?? "left", cell, widths[index] + 2));
      return `${indent}|${dashes.join("|")}|`;
    }
    return `${indent}| ${full.map((cell, index) => pad(cell, widths[index], aligns[index])).join(" | ")} |`;
  });
}

// A cell written ":--" keeps its colon (an explicit left).
function separatorCell(align, written, width) {
  const left = align === "center" || (align === "left" && written.startsWith(":"));
  const right = align === "center" || align === "right";
  return `${left ? ":" : ""}${"-".repeat(Math.max(3, width) - left - right)}${right ? ":" : ""}`;
}

function pad(cell, width, align) {
  const room = width - cell.length;
  if (align === "right") return " ".repeat(room) + cell;
  if (align === "center") return " ".repeat(Math.floor(room / 2)) + cell + " ".repeat(room - Math.floor(room / 2));
  return cell + " ".repeat(room);
}

/** A new empty table: a header, its separator and rows - 1 body rows (at least one). */
export function newTableLines(columns, rows) {
  const cols = Math.max(1, columns);
  const empty = `|${"   |".repeat(cols)}`;
  return alignTable([empty, `|${"---|".repeat(cols)}`, ...Array(Math.max(1, rows - 1)).fill(empty)]);
}

/** The text a cell shows: link titles, no ** or backticks, "\|" as "|". */
export function visibleText(cell) {
  return cell
    .replace(/\\\|/g, "|")
    .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/!?\[\[([^\]]*)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .trim();
}

const NUMBER = /^([-+]?)\$?(\d[\d,]*(?:\.\d*)?|\.\d+)\s*(?:%|[a-z]{1,3})?$/i;

/** How a cell sorts: { kind: 0 a number, 1 text, 2 empty, value }. */
export function sortKey(cell) {
  const text = visibleText(cell).toLowerCase();
  if (!text) return { kind: 2, value: "" };
  const match = NUMBER.exec(text);
  if (match) return { kind: 0, value: Number(match[1] + match[2].replace(/,/g, "")) };
  return { kind: 1, value: text };
}

// Up (dir 1) puts numbers before text; down (-1) turns both round. Empty cells go last always.
function compareKeys(a, b, dir) {
  if (a.kind !== b.kind) {
    if (a.kind === 2) return 1;
    if (b.kind === 2) return -1;
    return dir * (a.kind - b.kind);
  }
  if (a.value === b.value) return 0;
  return (a.value > b.value ? 1 : -1) * dir;
}

/** Where the rows to sort start: under the separator, or every row when there is none. */
function bodyStart(lines) {
  const separator = lines.findIndex(isSeparatorRow);
  return separator < 0 ? 0 : separator + 1;
}

/** The column index a name stands for: a number from 1, or a header's text (any case). */
export function columnNamed(lines, name) {
  const text = String(name).trim();
  if (/^\d+$/.test(text)) return Number(text) - 1;
  const heads = cellsOf(lines[0]).map((cell) => visibleText(cell).toLowerCase());
  return heads.indexOf(text.toLowerCase());
}

/** The header text of a column, when the table has a header (a separator under row one). */
export function columnTitle(lines, column) {
  if (!isSeparatorRow(lines[1] ?? "")) return "";
  return visibleText(cellsOf(lines[0])[column] ?? "");
}

/**
 * Sort the rows by a column. dir 1 up, -1 down, 0 up unless they are up already (then down,
 * so asking again turns it round). Returns { lines, dir } (the direction used).
 */
export function sortRows(lines, column, dir = 0) {
  const start = bodyStart(lines);
  const rows = lines.slice(start).map((text) => ({ text, key: sortKey(cellsOf(text)[column] ?? "") }));
  let use = dir;
  if (use === 0) {
    let up = true;
    let same = true;
    for (let index = 1; index < rows.length; index += 1) {
      const order = compareKeys(rows[index - 1].key, rows[index].key, 1);
      if (order > 0) up = false;
      if (order !== 0) same = false;
    }
    use = up && !same ? -1 : 1;
  }
  rows.sort((a, b) => compareKeys(a.key, b.key, use));
  return { lines: [...lines.slice(0, start), ...rows.map((row) => row.text)], dir: use };
}

/**
 * Set a column's alignment ("left", "center", "right") in its separator; a table with no
 * separator gets one under its first row. Returns { lines, added } (added: a line was put in).
 */
export function setColumnAlign(lines, column, how) {
  const out = [...lines];
  let at = out.findIndex(isSeparatorRow);
  const added = at < 0;
  if (added) {
    const indent = /^\s*/.exec(out[0])[0];
    out.splice(1, 0, `${indent}|${"---|".repeat(cellsOf(out[0]).length)}`);
    at = 1;
  }
  const cells = cellsOf(out[at]);
  while (cells.length <= column) cells.push("---");
  cells[column] = { left: "---", center: ":---:", right: "---:" }[how];
  out[at] = `${/^\s*/.exec(out[at])[0]}|${cells.join("|")}|`;
  return { lines: alignTable(out), added };
}

/** An empty row of `count` cells, indented like `like`. */
export function emptyRow(like, count) {
  return `${/^\s*/.exec(like)[0]}|${"   |".repeat(count)}`;
}
