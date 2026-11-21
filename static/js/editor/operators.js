// Operators act on a region of text:
//   { kind: "char", start, end }              end exclusive
//   { kind: "line", first, last }             whole lines, inclusive
//   { kind: "block", top, bottom, left, right, toEnd }   columns left..right (exclusive);
//                                              toEnd: to the end of every line ($)
import { comparePos, endAfter, firstNonBlankCol, leadingWhitespace, pos } from "./position.js";

/** The region a motion covers, from the cursor, applying Vim's rules for exclusive motions. */
export function regionFromMotion(buf, cursor, result) {
  const forward = comparePos(result.pos, cursor) >= 0;
  const from = forward ? cursor : result.pos;
  const to = forward ? result.pos : cursor;
  if (result.linewise) return { kind: "line", first: from.line, last: to.line };
  let end = result.inclusive ? pos(to.line, Math.min(to.col + 1, buf.lineLength(to.line))) : to;
  // An exclusive motion that ends at the start of a line really ends at the end of the line
  // before; if it also started at or before the first non-blank, it covers whole lines.
  if (!result.inclusive && end.col === 0 && end.line > from.line) {
    const lastLine = end.line - 1;
    if (from.col <= firstNonBlankCol(buf.line(from.line))) {
      return { kind: "line", first: from.line, last: lastLine };
    }
    end = pos(lastLine, buf.lineLength(lastLine));
  }
  return { kind: "char", start: from, end };
}

/** The region a text object returned. */
export function regionFromObject(object) {
  if (object.linewise) return { kind: "line", first: object.start.line, last: object.end.line };
  return { kind: "char", start: object.start, end: object.end };
}

/** The text a region holds, as a register value. */
export function regionValue(buf, region) {
  if (region.kind === "line") {
    return { text: buf.lines.slice(region.first, region.last + 1).join("\n"), type: "line" };
  }
  if (region.kind === "block") {
    const rows = [];
    for (let line = region.top; line <= region.bottom; line += 1) {
      const text = buf.line(line);
      rows.push(text.slice(region.left, region.toEnd ? text.length : region.right));
    }
    return { text: rows, type: "block" };
  }
  return { text: buf.slice(region.start, region.end), type: "char" };
}

/** Remove whole lines first..last; at least one (empty) line always remains. */
export function deleteLines(vim, first, last) {
  const buf = vim.buf;
  if (last < buf.lastLine) vim.edit(pos(first, 0), pos(last + 1, 0), "");
  else if (first > 0) vim.edit(pos(first - 1, buf.lineLength(first - 1)), pos(last, buf.lineLength(last)), "");
  else vim.edit(pos(0, 0), pos(last, buf.lineLength(last)), "");
}

function removeRegion(vim, region) {
  if (region.kind === "line") {
    deleteLines(vim, region.first, region.last);
  } else if (region.kind === "block") {
    for (let line = region.bottom; line >= region.top; line -= 1) {
      const length = vim.buf.lineLength(line);
      if (region.left >= length) continue;
      vim.edit(pos(line, region.left), pos(line, region.toEnd ? length : Math.min(region.right, length)), "");
    }
  } else {
    vim.edit(region.start, region.end, "");
  }
}

function isSmall(region) {
  return region.kind === "char" && region.start.line === region.end.line;
}

function startOf(region) {
  if (region.kind === "line") return pos(region.first, 0);
  if (region.kind === "block") return pos(region.top, region.left);
  return region.start;
}

function deleteOp(vim, region, { register }) {
  vim.registers.storeDelete(register, regionValue(vim.buf, region), { small: isSmall(region) });
  removeRegion(vim, region);
  if (region.kind === "line") {
    const line = Math.min(region.first, vim.buf.lastLine);
    vim.setCursor(pos(line, firstNonBlankCol(vim.buf.line(line))));
  } else {
    vim.setCursor(startOf(region));
  }
}

function yankOp(vim, region, { register }) {
  vim.registers.storeYank(register, regionValue(vim.buf, region));
  if (region.kind === "line") {
    // "yy" and "yj" leave the cursor alone; "yk" and "yip" move it to the first line.
    if (vim.cursor.line !== region.first) vim.setCursor(pos(region.first, vim.wantedCol(region.first)));
  } else {
    vim.setCursor(startOf(region));
  }
}

function changeOp(vim, region, { register }) {
  vim.registers.storeDelete(register, regionValue(vim.buf, region), { small: isSmall(region) });
  if (region.kind === "line") {
    // Keep one line, with the first line's indent when autoindent is on.
    const indent = vim.options.autoindent ? leadingWhitespace(vim.buf.line(region.first)) : "";
    const lastLength = vim.buf.lineLength(region.last);
    vim.edit(pos(region.first, 0), pos(region.last, lastLength), indent);
    vim.startInsert(pos(region.first, indent.length));
  } else if (region.kind === "block") {
    removeRegion(vim, region);
    vim.startBlockInsert({ top: region.top, bottom: region.bottom, col: region.left, append: false });
  } else {
    vim.edit(region.start, region.end, "");
    vim.startInsert(region.start, { insertAtEnd: true });
  }
}

function regionLines(region) {
  if (region.kind === "line") return [region.first, region.last];
  if (region.kind === "block") return [region.top, region.bottom];
  // A charwise region that ends at column 0 of a line does not touch that line.
  const last = region.end.col === 0 && region.end.line > region.start.line ? region.end.line - 1 : region.end.line;
  return [region.start.line, last];
}

function shift(direction) {
  return (vim, region, { times = 1 }) => {
    const [first, last] = regionLines(region);
    const width = vim.options.shiftwidth * times;
    for (let line = first; line <= last; line += 1) {
      const text = vim.buf.line(line);
      const indent = leadingWhitespace(text);
      const columns = indentWidth(indent, vim.options.shiftwidth);
      if (direction > 0 && text.length === 0) continue;
      const target = Math.max(0, columns + direction * width);
      const replacement = makeIndent(target, vim.options);
      if (replacement !== indent) vim.edit(pos(line, 0), pos(line, indent.length), replacement);
    }
    vim.setCursor(pos(first, firstNonBlankCol(vim.buf.line(first))));
    const count = last - first + 1;
    if (count > 2) vim.say(`${count} lines ${direction > 0 ? ">" : "<"}ed ${times} time${times === 1 ? "" : "s"}`);
  };
}

function indentWidth(indent, tabWidth) {
  let width = 0;
  for (const char of indent) width = char === "\t" ? width - (width % tabWidth) + tabWidth : width + 1;
  return width;
}

function makeIndent(width, options) {
  if (options.expandtab) return " ".repeat(width);
  return "\t".repeat(Math.floor(width / options.shiftwidth)) + " ".repeat(width % options.shiftwidth);
}

export const CASES = {
  lower: (text) => text.toLowerCase(),
  upper: (text) => text.toUpperCase(),
  toggleCase: (text) => [...text].map((char) => {
    const upper = char.toUpperCase();
    return char === upper ? char.toLowerCase() : upper;
  }).join(""),
};

function caseOp(transform) {
  return (vim, region) => {
    if (region.kind === "block") {
      for (let line = region.top; line <= region.bottom; line += 1) {
        const length = vim.buf.lineLength(line);
        const right = region.toEnd ? length : Math.min(region.right, length);
        replaceText(vim, pos(line, region.left), pos(line, right), transform);
      }
    } else if (region.kind === "line") {
      replaceText(vim, pos(region.first, 0), pos(region.last, vim.buf.lineLength(region.last)), transform);
    } else {
      replaceText(vim, region.start, region.end, transform);
    }
    vim.setCursor(startOf(region));
  };
}

function replaceText(vim, start, end, transform) {
  if (comparePos(start, end) >= 0) return;
  const old = vim.buf.slice(start, end);
  const changed = transform(old);
  if (changed === old) return;
  // Changing case can change length (German ß), so replace exactly the old span.
  vim.edit(start, endAfter(start, old), changed);
}

/** Operator functions by name: (vim, region, { register, times }). */
export const OPERATORS = {
  delete: deleteOp,
  yank: yankOp,
  change: changeOp,
  shiftRight: shift(1),
  shiftLeft: shift(-1),
  lower: caseOp(CASES.lower),
  upper: caseOp(CASES.upper),
  toggleCase: caseOp(CASES.toggleCase),
};

