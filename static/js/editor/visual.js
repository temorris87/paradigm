// Visual mode: the selection runs from vim.visual.anchor to the cursor.
// Modes: "char" (v), "line" (V), "block" (Ctrl-V).
import { EditorError } from "./errors.js";
import { OPERATORS, deleteLines, regionValue } from "./operators.js";
import { comparePos, lastCol, maxPos, minPos, pos } from "./position.js";
import { putOverRegion } from "./put.js";
import { SCROLL_ACTIONS } from "./scroll.js";
import { TEXT_OBJECTS } from "./text-objects.js";
import { nextPos } from "./words.js";
import { joinLines } from "./lines.js";

export function enterVisual(vim, mode) {
  vim.visual = { mode, anchor: { ...vim.cursor } };
  vim.mode = "visual";
}

/** v / V / Ctrl-V inside visual mode: switch to that mode, or leave if already in it. */
function switchVisual(mode) {
  return (vim) => {
    if (vim.visual.mode === mode) exitVisual(vim);
    else vim.visual.mode = mode;
  };
}

export function exitVisual(vim) {
  if (!vim.visual) return;
  const { mode, anchor } = vim.visual;
  vim.lastVisual = { mode, anchor: { ...anchor }, cursor: { ...vim.cursor }, want: vim.want };
  const [start, end] = mode === "line"
    ? [pos(Math.min(anchor.line, vim.cursor.line), 0), pos(Math.max(anchor.line, vim.cursor.line), 0)]
    : [minPos(anchor, vim.cursor), maxPos(anchor, vim.cursor)];
  vim.marks.set("<", start);
  vim.marks.set(">", end);
  vim.visual = null;
  vim.mode = "normal";
}

/** The selected region, in the form operators take. */
export function visualRegion(vim) {
  const { mode, anchor } = vim.visual;
  const cursor = vim.cursor;
  if (mode === "line") {
    return { kind: "line", first: Math.min(anchor.line, cursor.line), last: Math.max(anchor.line, cursor.line) };
  }
  if (mode === "block") {
    return {
      kind: "block",
      top: Math.min(anchor.line, cursor.line),
      bottom: Math.max(anchor.line, cursor.line),
      left: Math.min(anchor.col, cursor.col),
      right: Math.max(anchor.col, cursor.col) + 1,
      toEnd: vim.want === Infinity,
    };
  }
  const start = minPos(anchor, cursor);
  const last = maxPos(anchor, cursor);
  const length = vim.buf.lineLength(last.line);
  // On an empty line, or after $, the selection takes in the line break.
  const takesBreak = last.col >= length || (last === cursor && vim.want === Infinity);
  let end = pos(last.line, last.col + 1);
  if (takesBreak) end = last.line < vim.buf.lastLine ? pos(last.line + 1, 0) : pos(last.line, length);
  return { kind: "char", start, end };
}

/** The size of the selection, so "." can select the same amount again. */
export function selectionShape(vim) {
  const { mode, anchor } = vim.visual;
  const start = minPos(anchor, vim.cursor);
  const end = maxPos(anchor, vim.cursor);
  return {
    mode,
    lines: end.line - start.line,
    cols: mode === "block" ? Math.abs(anchor.col - vim.cursor.col) : end.col - start.col,
    endCol: end.col,
    toEnd: vim.want === Infinity,
  };
}

export function restoreShape(vim, shape) {
  const anchor = { ...vim.cursor };
  const line = Math.min(vim.buf.lastLine, anchor.line + shape.lines);
  let col = anchor.col;
  if (shape.mode === "block" || (shape.mode === "char" && shape.lines === 0)) col += shape.cols;
  else if (shape.mode === "char") col = shape.endCol;
  vim.visual = { mode: shape.mode, anchor };
  vim.mode = "visual";
  vim.cursor = pos(line, Math.min(col, lastCol(vim.buf.line(line))));
  vim.want = shape.toEnd ? Infinity : vim.cursor.col;
}

/** gv: select the last visual area again. */
export function reselect(vim) {
  const last = vim.lastVisual;
  if (!last) throw new EditorError("");
  const clampPos = (at) => {
    const line = Math.min(at.line, vim.buf.lastLine);
    return pos(line, Math.min(at.col, lastCol(vim.buf.line(line))));
  };
  vim.visual = { mode: last.mode, anchor: clampPos(last.anchor) };
  vim.mode = "visual";
  vim.cursor = clampPos(last.cursor);
  vim.want = last.want;
}

// Objects that grow forward when typed again (viwiw); the others reach one level further out.
const GROWS_FORWARD = new Set(["word", "bigWord", "sentence", "paragraph"]);

/** A text object typed in visual mode selects it, or grows the selection already there. */
export function selectObject(vim, entry, count) {
  const find = (at, times) => TEXT_OBJECTS[entry.name](vim.buf, at, times, entry.around);
  const { anchor } = vim.visual;
  const extending = comparePos(vim.cursor, anchor) > 0;
  let object;
  if (extending && GROWS_FORWARD.has(entry.name)) {
    object = find(nextPos(vim.buf, vim.cursor) ?? vim.cursor, count);
    if (object) object = { ...object, start: anchor };
  } else {
    object = find(vim.cursor, count);
    if (object && extending && covers(vim, object)) object = find(vim.cursor, count + 1);
  }
  if (!object || (!object.linewise && comparePos(object.start, object.end) >= 0)) throw new EditorError("");
  if (object.linewise) {
    vim.visual = { mode: "line", anchor: pos(Math.min(object.start.line, anchor.line), 0) };
    vim.setCursor(pos(object.end.line, 0));
    return;
  }
  vim.visual.anchor = object.start;
  const { end } = object;
  if (end.col === 0 && end.line > object.start.line) {
    vim.setCursor(pos(end.line - 1, vim.buf.lineLength(end.line - 1)));
  } else {
    vim.setCursor(pos(end.line, end.col - 1));
  }
}

// Is the object exactly what is selected now?
function covers(vim, object) {
  const region = visualRegion(vim);
  return region.kind === "char" && comparePos(region.start, object.start) === 0 && comparePos(region.end, object.end) === 0;
}

/** An operator typed in visual mode acts on the selection. Returns the shape for ".". */
export function applyVisualOperator(vim, name, cmd) {
  const region = visualRegion(vim);
  const shape = selectionShape(vim);
  exitVisual(vim);
  OPERATORS[name](vim, region, { register: cmd.register, times: cmd.count ?? 1 });
  return shape;
}

// The selection as whole lines (X, D, S, C, Y outside block mode).
function linesOf(region) {
  if (region.kind === "line") return region;
  if (region.kind === "block") return { kind: "line", first: region.top, last: region.bottom };
  const last = region.end.col === 0 && region.end.line > region.start.line ? region.end.line - 1 : region.end.line;
  return { kind: "line", first: region.start.line, last };
}

function onSelection(handler) {
  return (vim, ctx) => {
    const region = visualRegion(vim);
    ctx.shape = selectionShape(vim);
    exitVisual(vim);
    handler(vim, region, ctx);
  };
}

const deleteLinesAction = onSelection((vim, region, ctx) => {
  OPERATORS.delete(vim, linesOf(region), { register: ctx.register });
});

const deleteToEnd = onSelection((vim, region, ctx) => {
  const target = region.kind === "block" ? { ...region, toEnd: true } : linesOf(region);
  OPERATORS.delete(vim, target, { register: ctx.register });
});

const changeLines = onSelection((vim, region, ctx) => {
  OPERATORS.change(vim, linesOf(region), { register: ctx.register });
});

const changeToEnd = onSelection((vim, region, ctx) => {
  if (region.kind !== "block") {
    OPERATORS.change(vim, linesOf(region), { register: ctx.register });
    return;
  }
  OPERATORS.delete(vim, { ...region, toEnd: true }, { register: ctx.register });
  vim.startBlockInsert({ top: region.top, bottom: region.bottom, col: region.left, append: true });
});

const yankLines = onSelection((vim, region, ctx) => {
  OPERATORS.yank(vim, region.kind === "block" ? { ...region, toEnd: true } : linesOf(region), { register: ctx.register });
});

const replaceSelection = onSelection((vim, region, ctx) => {
  if ([...ctx.arg].length !== 1) throw new EditorError("");
  const spans = [];
  if (region.kind === "line") {
    for (let line = region.first; line <= region.last; line += 1) spans.push([line, 0, vim.buf.lineLength(line)]);
  } else if (region.kind === "block") {
    for (let line = region.top; line <= region.bottom; line += 1) {
      const length = vim.buf.lineLength(line);
      spans.push([line, Math.min(region.left, length), region.toEnd ? length : Math.min(region.right, length)]);
    }
  } else {
    for (let line = region.start.line; line <= region.end.line; line += 1) {
      const from = line === region.start.line ? region.start.col : 0;
      const to = line === region.end.line ? region.end.col : vim.buf.lineLength(line);
      spans.push([line, from, Math.min(to, vim.buf.lineLength(line))]);
    }
  }
  for (const [line, from, to] of spans) {
    if (to > from) vim.edit(pos(line, from), pos(line, to), ctx.arg.repeat(to - from));
  }
  const start = region.kind === "line" ? pos(region.first, 0) : region.kind === "block" ? pos(region.top, region.left) : region.start;
  vim.setCursor(start);
});

function joinSelection(raw) {
  return onSelection((vim, region) => {
    const { first, last } = linesOf(region);
    joinLines(vim, first, Math.max(2, last - first + 1), raw);
  });
}

function putReplace(keepRegister) {
  return onSelection((vim, region, ctx) => {
    const name = ctx.register ?? '"';
    const value = vim.registers.get(name);
    if (!value) throw new EditorError(`E353: Nothing in register ${name}`);
    const removed = regionValue(vim.buf, region);
    if (region.kind === "line") deleteLines(vim, region.first, region.last);
    else OPERATORS.delete(vim, region, { register: "_" });
    if (!keepRegister) vim.registers.storeDelete(null, removed, { small: false });
    vim.setCursor(region.kind === "char" ? region.start : vim.cursor);
    putOverRegion(vim, region, value, ctx.count);
  });
}

function blockInsert(append) {
  return onSelection((vim, region) => {
    if (region.kind === "block") {
      vim.startBlockInsert({
        top: region.top,
        bottom: region.bottom,
        col: append ? region.right : region.left,
        left: region.left,
        append,
        toEnd: append && region.toEnd,
      });
      return;
    }
    // Outside block mode: insert before the selection, or append after it.
    if (region.kind === "line") {
      const line = append ? region.last : region.first;
      vim.startInsert(pos(line, append ? vim.buf.lineLength(line) : 0));
    } else {
      vim.startInsert(append ? region.end : region.start);
    }
  });
}

function swapEnds(vim) {
  const anchor = vim.visual.anchor;
  vim.visual.anchor = { ...vim.cursor };
  vim.setCursor(anchor);
}

function swapCorners(vim) {
  if (vim.visual.mode !== "block") {
    swapEnds(vim);
    return;
  }
  const anchorCol = vim.visual.anchor.col;
  vim.visual.anchor = pos(vim.visual.anchor.line, vim.cursor.col);
  vim.setCursor(pos(vim.cursor.line, anchorCol));
}

export const VISUAL_ACTIONS = {
  exitVisual,
  visualChar: switchVisual("char"),
  visualLine: switchVisual("line"),
  visualBlock: switchVisual("block"),
  swapEnds,
  swapCorners,
  deleteLines: deleteLinesAction,
  deleteToEnd,
  changeLines,
  changeToEnd,
  yankLines,
  replaceSelection,
  join: joinSelection(false),
  joinRaw: joinSelection(true),
  putReplace: putReplace(false),
  putReplaceKeep: putReplace(true),
  blockInsert: blockInsert(false),
  blockAppend: blockInsert(true),
  cmdlineRange: (vim) => {
    exitVisual(vim);
    vim.startCmdline(":", "'<,'>");
  },
  ...SCROLL_ACTIONS,
};
