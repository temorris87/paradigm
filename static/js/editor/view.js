// The viewport: which lines are on screen, and scrolling. The editor element tells the engine
// how many rows and columns fit (vim.view.height / width); everything here is plain math, so
// the scroll commands can be tested without a page. Long lines wrap at exactly `width`
// characters, and the renderer draws them the same way, so rows always agree.
import { clamp } from "./position.js";

export function rowsFor(vim, line) {
  if (!vim.options.wrap) return 1;
  let length = vim.buf.lineLength(line);
  // An insert cursor after the last character needs a cell of its own.
  if (vim.cursor.line === line && vim.cursor.col >= length && vim.isInsertLike()) length += 1;
  return Math.max(1, Math.ceil(length / Math.max(1, vim.view.width)));
}

function effectiveScrolloff(vim) {
  return Math.max(0, Math.min(vim.options.scrolloff, Math.floor((vim.view.height - 1) / 2)));
}

/** The last line that fits on screen in full (at least the top line). */
export function bottomLine(vim) {
  const last = vim.buf.lastLine;
  let rows = 0;
  for (let line = vim.view.top; line <= last; line += 1) {
    rows += rowsFor(vim, line);
    if (rows > vim.view.height) return Math.max(vim.view.top, line - 1);
  }
  return last;
}

/** Scroll so the cursor (plus scrolloff lines around it) is on screen. */
export function ensureCursorVisible(vim) {
  const view = vim.view;
  const so = effectiveScrolloff(vim);
  const line = vim.cursor.line;
  view.top = clamp(view.top, 0, vim.buf.lastLine);
  if (line - so < view.top) {
    view.top = Math.max(0, line - so);
  } else {
    view.top = Math.max(view.top, lowestTopShowing(vim, Math.min(vim.buf.lastLine, line + so)));
  }
  if (!vim.options.wrap) {
    const col = vim.cursor.col;
    if (col < view.left) view.left = col;
    else if (col >= view.left + view.width) view.left = col - view.width + 1;
  } else {
    view.left = 0;
  }
}

/** The smallest top line that still shows `line` in full. */
export function lowestTopShowing(vim, line) {
  let rows = 0;
  let top = line;
  for (let candidate = line; candidate >= 0; candidate -= 1) {
    rows += rowsFor(vim, candidate);
    if (rows > vim.view.height) break;
    top = candidate;
  }
  return top;
}

/** Scroll by `lines` (negative = up) and keep the cursor on screen. Returns false if stuck. */
export function scrollLines(vim, lines) {
  const view = vim.view;
  const top = clamp(view.top + lines, 0, vim.buf.lastLine);
  if (top === view.top) return false;
  view.top = top;
  keepCursorOnScreen(vim);
  return true;
}

/**
 * The lines the cursor may be on without scrolling: the screen minus scrolloff lines at
 * each end (no margin where the screen already shows the start or end of the text).
 */
export function cursorLineRange(vim) {
  const so = effectiveScrolloff(vim);
  const top = vim.view.top;
  const bottom = bottomLine(vim);
  const low = top === 0 ? 0 : Math.min(top + so, bottom);
  const high = bottom === vim.buf.lastLine ? bottom : Math.max(bottom - so, low);
  return { top, bottom, low, high };
}

export function keepCursorOnScreen(vim) {
  const { low, high } = cursorLineRange(vim);
  const line = clamp(vim.cursor.line, low, high);
  if (line !== vim.cursor.line) vim.moveToLine(line, { keepWant: true });
}

/** zt / zz / zb: put the cursor line at the top, middle or bottom of the screen. */
export function placeCursorLine(vim, where) {
  const line = vim.cursor.line;
  if (where === "top") {
    vim.view.top = line;
    return;
  }
  const limit = where === "middle" ? Math.floor((vim.view.height - rowsFor(vim, line)) / 2) + rowsFor(vim, line) : vim.view.height;
  let rows = 0;
  let top = line;
  for (let candidate = line; candidate >= 0; candidate -= 1) {
    rows += rowsFor(vim, candidate);
    if (rows > limit) break;
    top = candidate;
  }
  vim.view.top = top;
}

/** The screen row of each column chunk, for gj / gk. */
export function screenRowOf(vim, col) {
  return vim.options.wrap ? Math.floor(col / Math.max(1, vim.view.width)) : 0;
}
