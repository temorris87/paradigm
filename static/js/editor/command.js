// Normal and visual mode: collect keys until they form a command (parser.js), then run it.
// Also keeps the record of the last change, which "." replays.
import { ACTIONS } from "./actions.js";
import { EditorError } from "./errors.js";
import { MOTIONS, searchMotion } from "./motions.js";
import { OPERATORS, regionFromMotion, regionFromObject } from "./operators.js";
import { parse } from "./parser.js";
import { lastCol, pos } from "./position.js";
import { realignAt } from "./table-edit.js";
import { TEXT_OBJECTS } from "./text-objects.js";
import { applyVisualOperator, restoreShape, selectObject, VISUAL_ACTIONS } from "./visual.js";

export function commandKey(vim, key) {
  if (vim.pending.length === 0) vim.message = null;
  if (key === "<Esc>" && (vim.pending.length > 0 || vim.mode === "normal")) {
    vim.pending = [];
    return;
  }
  if (typeof key !== "string") return; // pasted text means nothing here
  vim.pending.push(key);
  const result = parse(vim.pending, vim.mode === "visual" ? "visual" : "normal");
  if (result.status === "incomplete") return;
  vim.pending = [];
  if (result.status === "invalid") {
    vim.bell();
    return;
  }
  const version = vim.buf.version;
  runCommand(vim, result.cmd);
  // A change on a table row lines the table up, in the same undo step. Undo and redo put back
  // exactly what was there, so they never do.
  if (vim.mode === "normal" && vim.buf.version !== version && !KEEP_AS_IS.has(result.cmd.entry.name)) realignAt(vim);
}

const KEEP_AS_IS = new Set(["undo", "redo"]);

function context(vim, cmd) {
  return { register: cmd.register, count: cmd.count ?? 1, hasCount: cmd.count !== null, arg: cmd.arg };
}

function runCommand(vim, cmd) {
  const { entry } = cmd;
  if (entry.kind === "motion") {
    if (entry.cmdline) {
      vim.startCmdline(entry.name === "searchForward" ? "/" : "?", "", cmd);
      return;
    }
    const result = runMotion(vim, entry, cmd.arg, cmd.count, null);
    if (!result) throw new EditorError("");
    moveTo(vim, result);
  } else if (entry.kind === "textobject") {
    selectObject(vim, entry, cmd.count ?? 1);
  } else if (entry.kind === "action") {
    const ctx = context(vim, cmd);
    const actions = vim.mode === "visual" ? VISUAL_ACTIONS : ACTIONS;
    actions[entry.name](vim, ctx);
    if (entry.change) recordChange(vim, cmd, ctx.shape);
  } else if (vim.mode === "visual") {
    const shape = applyVisualOperator(vim, entry.name, cmd);
    if (entry.change) recordChange(vim, cmd, shape);
  } else {
    runOperator(vim, cmd);
  }
}

function runMotion(vim, entry, arg, count, operator) {
  return MOTIONS[entry.name]({
    vim,
    buf: vim.buf,
    cursor: vim.cursor,
    count: count ?? 1,
    hasCount: count !== null,
    arg,
    operator,
  });
}

function moveTo(vim, result) {
  if (result.jump) vim.marks.set("'", vim.cursor);
  const { line, col } = result.pos;
  vim.cursor = pos(line, Math.min(col, lastCol(vim.buf.line(line))));
  if (result.want === Infinity) vim.want = Infinity;
  else if (result.want !== "keep") vim.want = vim.cursor.col;
}

// An operator in normal mode, with the motion, text object or doubled key after it.
function runOperator(vim, cmd) {
  const { entry, target } = cmd;
  if (target.entry.cmdline) {
    vim.startCmdline(target.entry.name === "searchForward" ? "/" : "?", "", cmd);
    return;
  }
  const count = cmd.count ?? 1;
  let region;
  if (target.entry.kind === "line") {
    const last = vim.cursor.line + count - 1;
    // Like Vim: a count past the end is cut short, except from the last line itself.
    if (last > vim.buf.lastLine && vim.cursor.line === vim.buf.lastLine) throw new EditorError("");
    region = { kind: "line", first: vim.cursor.line, last: Math.min(last, vim.buf.lastLine) };
  } else if (target.entry.kind === "textobject") {
    const object = TEXT_OBJECTS[target.entry.name](vim.buf, vim.cursor, count, target.entry.around);
    if (!object) throw new EditorError("");
    region = regionFromObject(object);
  } else {
    const result = runMotion(vim, target.entry, target.arg, cmd.count, entry.name);
    if (!result) throw new EditorError("");
    if (result.jump) vim.marks.set("'", vim.cursor);
    region = regionFromMotion(vim.buf, vim.cursor, result);
  }
  OPERATORS[entry.name](vim, region, { register: cmd.register, times: 1 });
  if (entry.change) recordChange(vim, cmd);
}

/** <CR> on a / or ? line: move there, or finish the operator that was waiting for it. */
export function completeSearch(vim, line) {
  const pattern = line.text || vim.search.pattern;
  if (!pattern) throw new EditorError("E35: No previous regular expression");
  const forward = line.type === "/";
  vim.setSearch(pattern, forward);
  const cmd = line.pendingCmd;
  const result = searchMotion({ vim, buf: vim.buf, cursor: vim.cursor, count: cmd.count ?? 1 }, pattern, forward);
  if (cmd.entry.kind !== "operator") {
    moveTo(vim, result);
    return;
  }
  vim.marks.set("'", vim.cursor);
  const region = regionFromMotion(vim.buf, vim.cursor, result);
  OPERATORS[cmd.entry.name](vim, region, { register: cmd.register, times: 1 });
  if (cmd.entry.change) recordChange(vim, { ...cmd, body: [...cmd.body, ...line.text, "<CR>"] });
}

// Remember a change for ".". One that went into insert mode is finished when insert ends.
function recordChange(vim, cmd, shape = null) {
  if (vim.replaying) return;
  const change = { register: cmd.register, count: cmd.count, body: cmd.body, shape };
  if (vim.isInsertLike()) vim.recording = { ...change, insertKeys: [] };
  else if (vim.mode === "cmdline") vim.recording = null;
  else vim.lastChange = change;
}

export function repeatLastChange(vim, count) {
  const change = vim.lastChange;
  if (!change) throw new EditorError("");
  const keys = [];
  if (change.register) keys.push('"', change.register);
  const useCount = count ?? change.count;
  if (useCount !== null && useCount !== undefined) keys.push(...String(useCount));
  keys.push(...change.body);
  vim.replaying = true;
  try {
    if (change.shape) restoreShape(vim, change.shape);
    for (const key of keys) vim.dispatch(key);
  } finally {
    vim.replaying = false;
  }
}
