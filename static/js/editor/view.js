// The viewport: which lines are on screen, and scrolling. The editor element tells the engine
// how many rows and columns fit (vim.view.height / width); everything here is plain math, so
// the scroll commands can be tested without a page.
//
// The screen starts at line view.top. Scrolling moves in steps of one line, as Vim does,
// however many rows a long line wraps to (text-layout.js says how many). Scrolloff and H/M/L
// count lines too.
import { clamp } from "./position.js";
import { textRows } from "./text-layout.js";

/** Rows a line takes on screen. */
export function rowsOf(vim, line) {
  return textRows(vim, line);
}

/** Walk `count` lines (negative = up) from line `from`. `short` says the text ran out first. */
function walk(vim, from, count) {
  const to = clamp(from + count, 0, vim.buf.lastLine);
  return { at: to, short: to !== from + count };
}

function normalizeTop(vim) {
  vim.view.top = clamp(vim.view.top, 0, vim.buf.lastLine);
}

/** The highest top that leaves at most `rows` rows above line `start`. */
function lineAbove(vim, start, rows) {
  let used = 0;
  let at = start;
  while (at > 0 && used < rows) {
    const above = rowsOf(vim, at - 1);
    if (used + above > rows) break;
    used += above;
    at -= 1;
  }
  return at;
}

/** The highest top that shows all of line `line`. */
function topShowingDownTo(vim, line) {
  const rows = rowsOf(vim, line);
  if (rows >= vim.view.height) return line;
  return lineAbove(vim, line, vim.view.height - rows);
}

/** The last line that fits on screen in full (at least the top line). */
export function bottomLine(vim) {
  const last = vim.buf.lastLine;
  let rows = 0;
  for (let line = vim.view.top; line <= last; line += 1) {
    rows += rowsOf(vim, line);
    if (rows > vim.view.height) return Math.max(vim.view.top, line - 1);
  }
  return last;
}

// Scrolloff, in lines, cut so the cursor fits between the margins.
function scrolloff(vim) {
  return Math.max(0, Math.min(vim.options.scrolloff, Math.floor((vim.view.height - 1) / 2)));
}

/** Scroll so the cursor (plus scrolloff lines around it) is on screen. */
export function ensureCursorVisible(vim) {
  normalizeTop(vim);
  const view = vim.view;
  const line = vim.cursor.line;
  const so = scrolloff(vim);
  const above = walk(vim, line, -so);
  // As in Vim: when the margin above reaches past the top (or the start of the text), the
  // screen moves up to it, and the bottom margin is not checked as well.
  if (line < view.top || above.short || above.at < view.top) {
    if (above.at < view.top) view.top = above.at;
  } else {
    const lowest = topShowingDownTo(vim, walk(vim, line, so).at);
    if (view.top < lowest) view.top = lowest;
  }
  if (!vim.options.wrap) {
    const col = vim.cursor.col;
    if (col < view.left) view.left = col;
    else if (col >= view.left + view.width) view.left = col - view.width + 1;
  } else {
    view.left = 0;
  }
}

/**
 * Scroll by `steps` lines (negative = up) and keep the cursor on screen. With stopAtEnd,
 * scrolling down stops once the end of the text shows (Ctrl-D). Returns false if nothing moved.
 */
export function scrollLines(vim, steps, { stopAtEnd = false } = {}) {
  normalizeTop(vim);
  const limit = stopAtEnd ? topShowingDownTo(vim, vim.buf.lastLine) : vim.buf.lastLine;
  const view = vim.view;
  const target = steps > 0 ? Math.min(view.top + steps, Math.max(view.top, limit)) : Math.max(0, view.top + steps);
  if (target === view.top) return false;
  view.top = target;
  keepCursorOnScreen(vim);
  return true;
}

/**
 * The lines the cursor may be on without scrolling: the screen minus scrolloff lines at each
 * end (no margin where the screen already shows the start or end of the text).
 */
export function cursorLineRange(vim) {
  const so = scrolloff(vim);
  const top = vim.view.top;
  const bottom = bottomLine(vim);
  const last = bottomVisible(vim);
  const atStart = top === 0;
  const atEnd = last >= vim.buf.lastLine;
  const low = Math.min(atStart ? 0 : walk(vim, top, so).at, last);
  const high = atEnd ? last : Math.max(walk(vim, last, -so).at, low);
  return { top, bottom, low, high };
}

// The last line on screen in full; the top line when even it does not fit.
function bottomVisible(vim) {
  let rows = 0;
  for (let line = vim.view.top; ; line += 1) {
    const height = rowsOf(vim, line);
    if (height > vim.view.height - rows) return line === vim.view.top ? line : line - 1;
    rows += height;
    if (line >= vim.buf.lastLine) return line;
  }
}

export function keepCursorOnScreen(vim) {
  const { low, high } = cursorLineRange(vim);
  const line = clamp(vim.cursor.line, low, high);
  if (line !== vim.cursor.line) vim.moveToLine(line, { keepWant: true });
}

/** zt / zz / zb: put the cursor line at the top, middle or bottom of the screen. */
export function placeCursorLine(vim, where) {
  const line = vim.cursor.line;
  const rows = rowsOf(vim, line);
  const height = vim.view.height;
  if (where === "top") vim.view.top = line;
  else if (where === "middle") vim.view.top = lineAbove(vim, line, Math.floor((height - rows) / 2));
  else vim.view.top = lineAbove(vim, line, height - rows);
}

/** The screen row of each column chunk, for gj / gk. */
export function screenRowOf(vim, col) {
  return vim.options.wrap ? Math.floor(col / Math.max(1, vim.view.width)) : 0;
}
