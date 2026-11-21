// Normal-mode commands that are not motions or operators. Each takes (vim, ctx) with
// ctx = { register, count, hasCount, arg }.
import { EditorError } from "./errors.js";
import { CASES } from "./operators.js";
import { joinLines, openLine } from "./lines.js";
import { lastCol, leadingWhitespace, pos } from "./position.js";
import { put } from "./put.js";
import { SCROLL_ACTIONS } from "./scroll.js";
import { enterVisual, reselect } from "./visual.js";

function insertAt(vim, ctx, at, kind = "i") {
  vim.startInsert(at, { count: ctx.count, kind });
}

function replaceChar(vim, ctx) {
  const { line, col } = vim.cursor;
  const text = vim.buf.line(line);
  if (col + ctx.count > text.length) throw new EditorError("");
  if (ctx.arg === "<CR>") {
    // r<CR> swaps the characters for one line break, as in Vim.
    vim.edit(pos(line, col), pos(line, col + ctx.count), "\n");
    vim.setCursor(pos(line + 1, 0));
    return;
  }
  if ([...ctx.arg].length !== 1) throw new EditorError("");
  vim.edit(pos(line, col), pos(line, col + ctx.count), ctx.arg.repeat(ctx.count));
  vim.setCursor(pos(line, col + ctx.count - 1));
}

function toggleCaseChar(vim, ctx) {
  const { line, col } = vim.cursor;
  const text = vim.buf.line(line);
  if (text.length === 0) throw new EditorError("");
  const end = Math.min(text.length, col + ctx.count);
  const old = text.slice(col, end);
  const changed = CASES.toggleCase(old);
  if (changed !== old) vim.edit(pos(line, col), pos(line, end), changed);
  vim.setCursor(pos(line, Math.min(col + changed.length, lastCol(vim.buf.line(line)))));
}

// Ctrl-A / Ctrl-X: the first number at or after the cursor on the line.
function addToNumber(sign) {
  return (vim, ctx) => {
    const { line, col } = vim.cursor;
    const text = vim.buf.line(line);
    const regex = /0[xX][0-9a-fA-F]+|0[bB][01]+|-?\d+/g;
    for (let match = regex.exec(text); match; match = regex.exec(text)) {
      const start = match.index;
      const end = start + match[0].length;
      if (end <= col) continue;
      const replacement = addTo(match[0], sign * ctx.count);
      vim.edit(pos(line, start), pos(line, end), replacement);
      vim.setCursor(pos(line, start + replacement.length - 1));
      return;
    }
    throw new EditorError("");
  };
}

function undo(vim, ctx) {
  for (let step = 0; step < ctx.count; step += 1) {
    const result = vim.undo.undo(vim.buf);
    if (!result) {
      if (step === 0) vim.say("Already at oldest change");
      break;
    }
    vim.afterHistory(result);
  }
}

function redo(vim, ctx) {
  for (let step = 0; step < ctx.count; step += 1) {
    const result = vim.undo.redo(vim.buf);
    if (!result) {
      if (step === 0) vim.say("Already at newest change");
      break;
    }
    vim.afterHistory(result);
  }
}

function setMark(vim, ctx) {
  if (!/^[a-z'`]$/.test(ctx.arg)) throw new EditorError("E191: Argument must be a letter or forward/backward quote");
  vim.marks.set(ctx.arg === "`" ? "'" : ctx.arg, vim.cursor);
}

// Hex and binary keep their prefix, width and letter case; decimals keep leading zeros
// (never read as octal, unlike Vim's default, so dates such as 07 count up to 08).
function addTo(number, delta) {
  const based = /^(0[xXbB])(.+)$/.exec(number);
  if (based) {
    const [, prefix, digits] = based;
    const radix = /[xX]/.test(prefix) ? 16 : 2;
    // Unsigned, as in Vim: below zero wraps around 64 bits.
    let value = BigInt(`${prefix.toLowerCase()}${digits}`) + BigInt(delta);
    if (value < 0n) value += 2n ** 64n;
    let text = value.toString(radix).padStart(digits.length, "0");
    if (/[A-F]/.test(digits)) text = text.toUpperCase();
    return prefix + text;
  }
  const negative = number.startsWith("-");
  const digits = negative ? number.slice(1) : number;
  const value = BigInt(number) + BigInt(delta);
  const absolute = (value < 0n ? -value : value).toString();
  const padded = digits.length > 1 && digits.startsWith("0") ? absolute.padStart(digits.length, "0") : absolute;
  return (value < 0n ? "-" : "") + padded;
}

/** Action functions by name; keys.js says which keys reach them. */
export const ACTIONS = {
  putAfter: (vim, ctx) => put(vim, { register: ctx.register, count: ctx.count }),
  putBefore: (vim, ctx) => put(vim, { register: ctx.register, count: ctx.count, before: true }),
  putAfterMove: (vim, ctx) => put(vim, { register: ctx.register, count: ctx.count, moveAfter: true }),
  putBeforeMove: (vim, ctx) => put(vim, { register: ctx.register, count: ctx.count, before: true, moveAfter: true }),
  insert: (vim, ctx) => insertAt(vim, ctx, vim.cursor),
  append: (vim, ctx) => {
    const { line, col } = vim.cursor;
    insertAt(vim, ctx, pos(line, Math.min(col + 1, vim.buf.lineLength(line))));
  },
  insertLineStart: (vim, ctx) => {
    const line = vim.cursor.line;
    const text = vim.buf.line(line);
    insertAt(vim, ctx, pos(line, leadingWhitespace(text).length));
  },
  insertColumnZero: (vim, ctx) => insertAt(vim, ctx, pos(vim.cursor.line, 0)),
  appendLineEnd: (vim, ctx) => insertAt(vim, ctx, pos(vim.cursor.line, vim.buf.lineLength(vim.cursor.line))),
  openBelow: (vim, ctx) => {
    vim.checkWritable();
    insertAt(vim, ctx, openLine(vim, true), "o");
  },
  openAbove: (vim, ctx) => {
    vim.checkWritable();
    insertAt(vim, ctx, openLine(vim, false), "O");
  },
  insertAtLastInsert: (vim, ctx) => {
    const mark = vim.marks.get("^");
    const line = mark ? Math.min(mark.line, vim.buf.lastLine) : vim.cursor.line;
    const col = mark ? Math.min(mark.col, vim.buf.lineLength(line)) : vim.cursor.col;
    insertAt(vim, ctx, pos(line, col));
  },
  replaceMode: (vim, ctx) => vim.startInsert(vim.cursor, { count: ctx.count, kind: "R", replace: true }),
  replaceChar,
  toggleCaseChar,
  join: (vim, ctx) => joinLines(vim, vim.cursor.line, ctx.count, false),
  joinRaw: (vim, ctx) => joinLines(vim, vim.cursor.line, ctx.count, true),
  increment: addToNumber(1),
  decrement: addToNumber(-1),
  undo,
  redo,
  repeat: (vim, ctx) => vim.repeatLastChange(ctx.hasCount ? ctx.count : null),
  visualChar: (vim) => enterVisual(vim, "char"),
  visualLine: (vim) => enterVisual(vim, "line"),
  visualBlock: (vim) => enterVisual(vim, "block"),
  reselect,
  cmdline: (vim, ctx) => vim.startCmdline(":", ctx.hasCount ? `.,.+${ctx.count - 1}` : ""),
  setMark,
  writeQuit: (vim) => vim.runEx("x"),
  quitForce: (vim) => vim.runEx("q!"),
  ...SCROLL_ACTIONS,
};

