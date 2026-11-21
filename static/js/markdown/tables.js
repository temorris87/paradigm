// GFM tables: a header row, a delimiter row ("| :-- | :-: |") and body rows. Cells split on
// unescaped pipes; "\|" is a literal pipe, also inside code spans.

const DELIMITER_CELL = /^:?-+:?$/;

/** Split a row into trimmed cell texts, dropping the outer pipes. */
export function splitRow(text) {
  let row = text.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells = [];
  let cell = "";
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === "\\" && row[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (row[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** The column alignments if `text` is a delimiter row for `header`, otherwise null. */
export function readDelimiterRow(text, header) {
  if (!text.includes("|") && !header.includes("|")) return null;
  if (!/^[\s|:-]+$/.test(text) || !text.includes("-")) return null;
  const cells = splitRow(text);
  if (!cells.every((cell) => DELIMITER_CELL.test(cell))) return null;
  if (cells.length !== splitRow(header).length) return null;
  return cells.map(alignment);
}

function alignment(cell) {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** Fit a body row to the header's width: pad with empty cells, drop extras. */
export function fitRow(cells, width) {
  const row = cells.slice(0, width);
  while (row.length < width) row.push("");
  return row;
}
