// The viewport: which lines are on screen, and scrolling. The editor element tells the engine
// how many rows and columns fit (vim.view.height / width); everything here is plain math, so
// the scroll commands can be tested without a page.
//
// Lines are grouped into units by vim.layout (text-layout.js): a plain line, or in live
// preview a rendered Markdown block that is several lines tall in the source and any number
// of rows tall on screen. The screen starts at unit view.top, with view.skip rows of it
// scrolled off the top.
//
// Scrolling moves in steps, as Vim does: a plain line is one step however many rows it wraps
// to, and a rendered unit is one step per row, so a block taller than the screen can be
// scrolled through. Scrolloff and H/M/L count steps too. A position is { line, skip }: a
// unit's first line, and the rows of it above (only ever non-zero in a rendered unit).
import { clamp } from "./position.js";

export function unitAt(vim, line) {
  return vim.layout.unitAt(vim, line);
}

const EPSILON = 1e-6;
const before = (a, b) => a.line < b.line || (a.line === b.line && a.skip < b.skip - EPSILON);
const topOf = (vim) => ({ line: vim.view.top, skip: vim.view.skip });

function setTop(vim, at) {
  vim.view.top = at.line;
  vim.view.skip = at.skip;
}

// The steps in a rendered unit: one per whole row (a 1.2-row heading is one step).
const stepsIn = (unit) => (unit.rendered ? Math.max(1, Math.round(unit.rows)) : 1);

function stepDown(vim, at) {
  const unit = unitAt(vim, at.line);
  if (unit.rendered && Math.floor(at.skip) + 1 < stepsIn(unit)) return { line: at.line, skip: Math.floor(at.skip) + 1 };
  if (unit.end >= vim.buf.lastLine) return null;
  return { line: unit.end + 1, skip: 0 };
}

function stepUp(vim, at) {
  if (at.skip > EPSILON) return { line: at.line, skip: Math.max(0, Math.ceil(at.skip) - 1) };
  if (at.line === 0) return null;
  const unit = unitAt(vim, at.line - 1);
  return { line: unit.start, skip: stepsIn(unit) - 1 };
}

/** Walk `count` steps (negative = up). `short` says the text ran out first. */
function walk(vim, from, count) {
  let at = from;
  for (let step = 0; step < Math.abs(count); step += 1) {
    const next = count > 0 ? stepDown(vim, at) : stepUp(vim, at);
    if (!next) return { at, short: true };
    at = next;
  }
  return { at, short: false };
}

/** The source line a position stands for: inside a rendered unit, by proportion. */
function lineAt(vim, at) {
  const unit = unitAt(vim, at.line);
  if (!unit.rendered) return at.line;
  const lines = unit.end - unit.start + 1;
  return unit.start + clamp(Math.floor((at.skip / Math.max(1, unit.rows)) * lines + EPSILON), 0, lines - 1);
}

/**
 * Keep view.top on the first line of a unit. Units change as the cursor moves (a block turns
 * raw or rendered again), so the top can end up inside one; map it across by proportion.
 */
export function normalizeTop(vim) {
  const view = vim.view;
  view.top = clamp(view.top, 0, vim.buf.lastLine);
  let unit = unitAt(vim, view.top);
  if (!unit.rendered && view.skip > 0) {
    // A block scrolled part way has turned raw: its hidden rows become hidden lines.
    view.top = Math.min(vim.buf.lastLine, view.top + Math.round(view.skip));
    view.skip = 0;
    unit = unitAt(vim, view.top);
  }
  if (unit.rendered) {
    const into = view.top === unit.start ? view.skip : ((view.top - unit.start) / (unit.end - unit.start + 1)) * unit.rows;
    view.top = unit.start;
    view.skip = clamp(into, 0, stepsIn(unit) - 1);
  } else {
    view.top = unit.start;
    view.skip = 0;
  }
}

/** The position that leaves at most `rows` rows above line `start` (a unit start). */
function positionAbove(vim, start, rows) {
  let used = 0;
  let at = start;
  while (at > 0 && used < rows - EPSILON) {
    const unit = unitAt(vim, at - 1);
    if (used + unit.rows <= rows + EPSILON) {
      used += unit.rows;
      at = unit.start;
    } else {
      // A rendered unit can show its bottom part; a raw line is all or nothing.
      if (unit.rendered) return { line: unit.start, skip: unit.rows - (rows - used) };
      break;
    }
  }
  return { line: at, skip: 0 };
}

/** The highest top that shows everything down to position `at` (its row, or whole line). */
function topShowingDownTo(vim, at) {
  const unit = unitAt(vim, at.line);
  const rows = unit.rendered ? Math.min(unit.rows, Math.floor(at.skip) + 1) : unit.rows;
  if (rows >= vim.view.height) return { line: unit.start, skip: unit.rendered ? rows - vim.view.height : 0 };
  return positionAbove(vim, unit.start, vim.view.height - rows);
}

/** The last line that fits on screen in full (at least the top line). */
export function bottomLine(vim) {
  const last = vim.buf.lastLine;
  let rows = -vim.view.skip;
  for (let line = vim.view.top; line <= last; ) {
    const unit = unitAt(vim, line);
    rows += unit.rows;
    if (rows > vim.view.height + EPSILON) return Math.max(vim.view.top, unit.start - 1);
    line = unit.end + 1;
  }
  return last;
}

/** The last step on screen in full: a whole raw line, or a whole row of a rendered unit. */
function bottomPosition(vim) {
  const top = topOf(vim);
  let rows = -vim.view.skip;
  let line = vim.view.top;
  for (;;) {
    const unit = unitAt(vim, line);
    const rowsLeft = vim.view.height - rows;
    if (unit.rows > rowsLeft + EPSILON) {
      const fit = unit.rendered ? Math.floor(rowsLeft + (line === top.line ? top.skip : 0) + EPSILON) - 1 : -1;
      if (fit >= 0) return { line: unit.start, skip: Math.min(fit, stepsIn(unit) - 1) };
      if (line === top.line) return top;
      return stepUp(vim, { line: unit.start, skip: 0 });
    }
    rows += unit.rows;
    if (unit.end >= vim.buf.lastLine) return { line: unit.start, skip: stepsIn(unit) - 1 };
    line = unit.end + 1;
  }
}

// Scrolloff, in steps, cut so the cursor fits between the margins.
function scrolloff(vim) {
  return Math.max(0, Math.min(vim.options.scrolloff, Math.floor((vim.view.height - 1) / 2)));
}

/** Scroll so the cursor (plus scrolloff steps around it) is on screen. */
export function ensureCursorVisible(vim) {
  normalizeTop(vim);
  const view = vim.view;
  const unit = unitAt(vim, vim.cursor.line);
  const so = scrolloff(vim);
  const [first, last] = cursorSteps(vim, unit);
  const above = walk(vim, { line: unit.start, skip: first }, -so);
  // As in Vim: when the margin above reaches past the top (or the start of the text), the
  // screen moves up to it, and the bottom margin is not checked as well.
  if (unit.start < view.top || above.short || before(above.at, topOf(vim))) {
    if (before(above.at, topOf(vim))) setTop(vim, above.at);
  } else {
    const below = walk(vim, { line: unit.start, skip: last }, so);
    const lowest = topShowingDownTo(vim, below.at);
    if (before(topOf(vim), lowest)) setTop(vim, lowest);
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
 * The steps of the cursor's unit that must be on screen: all of it, except a rendered block
 * taller than the screen (the cursor stays in it in normal mode), where it is the step the
 * cursor's line stands at, by proportion (as lineAt maps a step back to a line).
 */
function cursorSteps(vim, unit) {
  const steps = stepsIn(unit);
  if (!unit.rendered || steps <= vim.view.height - 2 * scrolloff(vim)) return [0, steps - 1];
  const lines = unit.end - unit.start + 1;
  const step = clamp(Math.ceil(((vim.cursor.line - unit.start) / lines) * unit.rows - EPSILON), 0, steps - 1);
  return [step, step];
}

/**
 * Scroll by `steps` (negative = up) and keep the cursor on screen. With stopAtEnd, scrolling
 * down stops once the end of the text shows (Ctrl-D). Returns false if nothing moved.
 */
export function scrollLines(vim, steps, { stopAtEnd = false } = {}) {
  normalizeTop(vim);
  const end = unitAt(vim, vim.buf.lastLine);
  const limit = stopAtEnd ? topShowingDownTo(vim, { line: end.start, skip: stepsIn(end) - 1 }) : null;
  let moved = false;
  for (let step = 0; step < Math.abs(steps); step += 1) {
    if (steps > 0 && limit && !before(topOf(vim), limit)) break;
    const next = steps > 0 ? stepDown(vim, topOf(vim)) : stepUp(vim, topOf(vim));
    if (!next) break;
    setTop(vim, next);
    moved = true;
  }
  if (moved) keepCursorOnScreen(vim);
  return moved;
}

/**
 * The lines the cursor may be on without scrolling: the screen minus scrolloff steps at each
 * end (no margin where the screen already shows the start or end of the text). Inside a
 * rendered unit the line is found by proportion; the cursor landing there turns it raw.
 */
export function cursorLineRange(vim) {
  const so = scrolloff(vim);
  const top = vim.view.top;
  const bottom = bottomLine(vim);
  const last = bottomPosition(vim);
  const lastLine = lineAt(vim, last);
  const atStart = top === 0 && vim.view.skip === 0;
  const atEnd = stepDown(vim, last) === null;
  const low = Math.min(atStart ? 0 : lineAt(vim, walk(vim, topOf(vim), so).at), lastLine);
  const high = atEnd ? lastLine : Math.max(lineAt(vim, walk(vim, last, -so).at), low);
  return { top, bottom, low, high };
}

export function keepCursorOnScreen(vim) {
  const { low, high } = cursorLineRange(vim);
  const line = clamp(vim.cursor.line, low, high);
  if (line !== vim.cursor.line) vim.moveToLine(line, { keepWant: true });
}

/** zt / zz / zb: put the cursor line at the top, middle or bottom of the screen. */
export function placeCursorLine(vim, where) {
  const unit = unitAt(vim, vim.cursor.line);
  const height = vim.view.height;
  if (where === "top") setTop(vim, { line: unit.start, skip: 0 });
  else if (where === "middle") setTop(vim, positionAbove(vim, unit.start, Math.floor((height - unit.rows) / 2)));
  else setTop(vim, positionAbove(vim, unit.start, height - unit.rows));
}

/** The screen row of each column chunk, for gj / gk. */
export function screenRowOf(vim, col) {
  return vim.options.wrap ? Math.floor(col / Math.max(1, vim.view.width)) : 0;
}
