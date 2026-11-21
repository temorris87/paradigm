// Scrolling commands (Ctrl-D, Ctrl-F, zz ...), shared by normal and visual mode.
import { EditorError } from "./errors.js";
import { clamp, firstNonBlankCol, pos } from "./position.js";
import { keepCursorOnScreen, placeCursorLine, scrollLines } from "./view.js";

// Ctrl-D / Ctrl-U scroll and move the cursor by the same amount; a count sets the amount
// for later uses too (Vim's 'scroll' option). Scrolling stops once the last line shows.
function halfPage(direction) {
  return (vim, ctx) => {
    if (ctx.hasCount) vim.scrollAmount = ctx.count;
    const amount = vim.scrollAmount || Math.max(1, Math.floor(vim.view.height / 2));
    const last = vim.buf.lastLine;
    if (direction > 0 ? vim.cursor.line >= last : vim.cursor.line === 0) throw new EditorError("");
    const from = vim.cursor.line;
    scrollLines(vim, direction * amount, { stopAtEnd: true });
    vim.moveToLine(clamp(from + direction * amount, 0, last), { keepWant: true });
    keepCursorOnScreen(vim);
    toFirstNonBlank(vim);
  };
}

// Ctrl-F / Ctrl-B: a screen minus two lines; the cursor stays on screen.
function page(direction) {
  return (vim, ctx) => {
    const amount = Math.max(1, vim.view.height - 2) * ctx.count;
    if (!scrollLines(vim, direction * amount)) throw new EditorError("");
    toFirstNonBlank(vim);
  };
}

function toFirstNonBlank(vim) {
  const line = vim.cursor.line;
  vim.setCursor(pos(line, firstNonBlankCol(vim.buf.line(line))));
}

function scrollBy(direction) {
  return (vim, ctx) => {
    scrollLines(vim, direction * ctx.count);
  };
}

function place(where, startOfLine) {
  return (vim) => {
    placeCursorLine(vim, where);
    if (startOfLine) toFirstNonBlank(vim);
  };
}

export const SCROLL_ACTIONS = {
  halfPageDown: halfPage(1),
  halfPageUp: halfPage(-1),
  pageDown: page(1),
  pageUp: page(-1),
  scrollDown: scrollBy(1),
  scrollUp: scrollBy(-1),
  scrollCenter: place("middle", false),
  scrollCenterStart: place("middle", true),
  scrollTop: place("top", false),
  scrollTopStart: place("top", true),
  scrollBottom: place("bottom", false),
  scrollBottomStart: place("bottom", true),
};
