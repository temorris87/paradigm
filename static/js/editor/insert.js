// Insert and replace mode. vim.insert is the session: where it started, its count, the keys
// typed (to repeat for "3ix<Esc>"), the characters replace mode overwrote, the block for
// a visual-block insert, and the current ‹blank› (blank: { line, start, end }, the cursor at
// its start): the first character typed replaces it whole, Backspace deletes it, and any
// other key (a move, Tab, Esc) forgets it, leaving it in the text. quiet ({ line, col, text })
// is where a blank was just deleted or a completion row went in: the completion list waits
// there for the next key, as at a current blank.
import { findBlank, nextBlank } from "./blanks.js";
import { findKey, INSERT_KEYS } from "./keys.js";
import { isTextKey } from "./key-names.js";
import { openLine } from "./lines.js";
import { endAfter, leadingWhitespace, pos } from "./position.js";
import { moveCell, putTable, realignAt, tableMayGoHere } from "./table-edit.js";
import { pasteAsTable } from "./table-paste.js";
import { isTableLine } from "./tables.js";

export function insertKey(vim, key) {
  const session = vim.insert;
  session.quiet = null;
  if (session.awaitingRegister) {
    session.awaitingRegister = false;
    record(vim, key);
    insertRegister(vim, key);
    return;
  }
  const entry = typeof key === "string" ? findKey(INSERT_KEYS, key) : null;
  if (entry?.name !== "leave" && entry?.name !== "oneCommand" && entry?.name !== "complete") record(vim, key);
  if (entry) {
    if (!KEEPS_BLANK.has(entry.name)) session.blank = null;
    HANDLERS[entry.name](vim, session);
  } else if (typeof key === "object" && key.paste !== undefined) {
    pasteText(vim, key.paste);
  } else if (isTextKey(key)) {
    if (key === " ") session.typedSpace = true;
    typeText(vim, key);
  }
}

// Keep what is typed, for a count ("3ix") and for "." (vim.recording).
function record(vim, key) {
  const session = vim.insert;
  if (session.replaying) return;
  session.keys.push(key);
  if (vim.recording && !vim.replaying) vim.recording.insertKeys.push(key);
}

// Keys that look at the current blank themselves (Ctrl-Space keeps it for a completion row).
const KEEPS_BLANK = new Set(["tab", "backspace", "complete"]);

function typeText(vim, text) {
  const session = vim.insert;
  session.pendingIndent = null;
  const blank = currentBlank(vim);
  session.blank = null;
  const { line, col } = vim.cursor;
  const current = vim.buf.line(line);
  if (blank) {
    vim.edit(pos(line, blank.start), pos(line, blank.end), text);
  } else if (vim.mode === "replace" && !text.includes("\n")) {
    // Overwrite as many characters as were typed, remembering them for <BS>.
    const end = Math.min(current.length, col + text.length);
    for (let index = 0; index < text.length; index += 1) session.replaced.push(col + index < current.length ? current[col + index] : null);
    vim.edit(pos(line, col), pos(line, end), text);
  } else {
    vim.edit(pos(line, col), pos(line, col), text);
  }
  vim.setCursor(endAfter(pos(line, col), text));
}

// Cells from Excel, Word or a web page become a table (table-paste.js); other text goes in as is.
function pasteText(vim, text) {
  const table = vim.mode === "insert" && tableMayGoHere(vim) ? pasteAsTable(text) : null;
  if (!table) {
    typeText(vim, text);
    return;
  }
  vim.insert.pendingIndent = null;
  vim.insert.blank = null;
  putTable(vim, table, { insert: true });
}

// Tab, Shift-Tab, Enter and Shift-Enter move between cells on a table row (insert mode only;
// replace mode keeps Vim's own keys).
function inTable(vim) {
  return vim.mode === "insert" && isTableLine(vim.buf.lines, vim.cursor.line);
}

function newline(vim, session) {
  if (inTable(vim)) {
    moveCell(vim, "down");
    return;
  }
  // The indent is taken before an unused one is dropped, so it carries on to the next line.
  const indent = vim.options.autoindent ? leadingWhitespace(vim.buf.line(vim.cursor.line)) : "";
  dropUnusedIndent(vim);
  const { line, col } = vim.cursor;
  vim.edit(pos(line, col), pos(line, col), `\n${indent}`);
  vim.setCursor(pos(line + 1, indent.length));
  session.pendingIndent = indent ? line + 1 : null;
}

// Vim removes an automatic indent that nothing was typed after, on <CR> or <Esc>.
function dropUnusedIndent(vim) {
  const session = vim.insert;
  const line = session.pendingIndent;
  session.pendingIndent = null;
  if (line === null || line === undefined || vim.cursor.line !== line) return;
  const text = vim.buf.line(line);
  if (!/^[ \t]+$/.test(text) || vim.cursor.col !== text.length) return;
  vim.edit(pos(line, 0), pos(line, text.length), "");
  vim.setCursor(pos(line, 0));
}

function backspace(vim, session) {
  if (deleteCurrentBlank(vim)) return;
  session.blank = null;
  const { line, col } = vim.cursor;
  if (vim.mode === "replace") {
    if (col === 0) return;
    if (session.replaced.length > 0) {
      const original = session.replaced.pop();
      vim.edit(pos(line, col - 1), pos(line, col), original ?? "");
    }
    vim.setCursor(pos(line, col - 1));
    return;
  }
  if (col > 0) {
    const from = softTabStart(vim, line, col);
    vim.edit(pos(line, from), pos(line, col), "");
    vim.setCursor(pos(line, from));
  } else if (line > 0) {
    const length = vim.buf.lineLength(line - 1);
    vim.edit(pos(line - 1, length), pos(line, 0), "");
    vim.setCursor(pos(line - 1, length));
  }
}

// Like Vim with softtabstop = shiftwidth: <BS> after spaces goes back to the previous stop,
// unless a space was typed by hand in this insert (then spaces go one at a time, as in Vim).
function softTabStart(vim, line, col) {
  const text = vim.buf.line(line);
  if (!vim.options.expandtab || vim.insert.typedSpace || text[col - 1] !== " ") return col - 1;
  const stop = col - 1 - ((col - 1) % vim.options.shiftwidth);
  let from = col - 1;
  while (from > stop && text[from - 1] === " ") from -= 1;
  return from;
}

// <Tab>: spaces up to the next multiple of shiftwidth (a real tab without expandtab). Where the
// host has blanks on (vim.blankScope), the next ‹blank› first (after the current one, if any).
function tab(vim, session) {
  if (takeNextBlank(vim, session)) return;
  if (inTable(vim)) {
    moveCell(vim, "next");
    return;
  }
  const width = vim.options.shiftwidth;
  typeText(vim, vim.options.expandtab ? " ".repeat(width - (vim.cursor.col % width)) : "\t");
}

function takeNextBlank(vim, session) {
  const current = currentBlank(vim);
  session.blank = null;
  const scope = vim.mode === "insert" ? vim.blankScope?.(vim.buf.lines, vim.cursor.line) : null;
  const from = current ? pos(current.line, current.end) : vim.cursor;
  const blank = scope && nextBlank(vim.buf.lines, from, scope.first, scope.last);
  if (!blank) return false;
  takeBlank(vim, session, blank);
  return true;
}

/** The cursor goes to the blank's start and it becomes the current blank: it stays in the text
 * until typed over. Like a cursor move, "." and a count repeat only what comes after. */
export function takeBlank(vim, session, blank) {
  moveTo(vim, session, pos(blank.line, blank.start));
  session.blank = { line: blank.line, start: blank.start, end: blank.end };
}

/** The current blank, while the cursor is still at its start and it is still in the text. */
function currentBlank(vim) {
  const blank = vim.insert?.blank;
  if (!blank || vim.mode !== "insert") return null;
  const { line, col } = vim.cursor;
  if (line !== blank.line || col !== blank.start) return null;
  const found = findBlank(vim.buf.lines, pos(line, blank.start), pos(line, blank.end));
  return found && found.start === blank.start && found.end === blank.end ? found : null;
}

/** True while the completion list waits for a key: at the current blank, nothing typed over
 * it yet, or where a blank was just deleted or a completion row just went in. */
export function completionWaits(vim) {
  if (currentBlank(vim)) return true;
  const quiet = vim.insert?.quiet;
  const { line, col } = vim.cursor;
  return Boolean(quiet) && quiet.line === line && quiet.col === col && quiet.text === vim.buf.line(line);
}

/** The completion list waits here for the next key (a completion row just went in). */
export function quietHere(vim) {
  if (!vim.insert) return;
  const { line, col } = vim.cursor;
  vim.insert.quiet = { line, col, text: vim.buf.line(line) };
}

/** The current blank, if any, is deleted (Backspace there; a completion row taken there goes
 * in its place). The cursor stays at its start. */
export function deleteCurrentBlank(vim) {
  const blank = currentBlank(vim);
  if (vim.insert) vim.insert.blank = null;
  if (!blank) return false;
  vim.edit(pos(blank.line, blank.start), pos(blank.line, blank.end), "");
  vim.setCursor(pos(blank.line, blank.start));
  // What is left around it may read as a place with a list (B -->|| after a node): that list
  // would take Tab and Esc from the next blank and the insert.
  quietHere(vim);
  return true;
}

/** The first blank between two positions (to: the cursor by default), if any, is taken. */
export function takeBlankIn(vim, from, to = vim.cursor) {
  const blank = vim.insert && findBlank(vim.buf.lines, from, to);
  if (blank) takeBlank(vim, vim.insert, blank);
}

// <S-Tab>: the line's indent goes back one step; the cursor stays on the same text.
function unindent(vim) {
  if (inTable(vim)) {
    moveCell(vim, "prev");
    return;
  }
  const { line, col } = vim.cursor;
  const indent = leadingWhitespace(vim.buf.line(line));
  if (!indent) return;
  const width = vim.options.shiftwidth;
  const columns = indent.replace(/\t/g, " ".repeat(width)).length;
  const target = Math.max(0, Math.ceil(columns / width) * width - width);
  const replacement = vim.options.expandtab ? " ".repeat(target) : "\t".repeat(Math.floor(target / width)) + " ".repeat(target % width);
  vim.edit(pos(line, 0), pos(line, indent.length), replacement);
  vim.setCursor(pos(line, Math.max(replacement.length, col - (indent.length - replacement.length))));
}

function deleteChar(vim) {
  const { line, col } = vim.cursor;
  const length = vim.buf.lineLength(line);
  if (col < length) vim.edit(pos(line, col), pos(line, col + 1), "");
  else if (line < vim.buf.lastLine) vim.edit(pos(line, col), pos(line + 1, 0), "");
}

// Ctrl-U: delete what was typed before the cursor on this line; again, back to the indent.
function deleteToStart(vim, session) {
  const { line, col } = vim.cursor;
  if (col === 0) return;
  const indent = leadingWhitespace(vim.buf.line(line)).length;
  let from;
  if (session.start.line === line && session.start.col < col) from = session.start.col;
  else from = col > indent ? indent : 0;
  vim.edit(pos(line, from), pos(line, col), "");
  vim.setCursor(pos(line, from));
  session.start = pos(line, from);
}

function insertRegister(vim, name) {
  const value = vim.registers.get(name);
  if (!value) {
    vim.bell();
    return;
  }
  const text = Array.isArray(value.text) ? value.text.join("\n") : value.text;
  const { line, col } = vim.cursor;
  const inserted = value.type === "line" ? `${text}\n` : text;
  vim.edit(pos(line, col), pos(line, col), inserted);
  vim.setCursor(endAfter(pos(line, col), inserted));
}

// Moving with the arrow keys starts afresh: "." and a count only repeat what comes after.
function moveTo(vim, session, at, want) {
  session.blank = null;
  vim.setCursor(at);
  if (want !== undefined) vim.want = want;
  session.start = { ...vim.cursor };
  session.keys = [];
  session.count = 1;
  if (vim.recording) vim.recording.insertKeys = [];
}

function moveVertical(vim, session, delta) {
  const line = vim.cursor.line + delta;
  if (line < 0 || line > vim.buf.lastLine) return;
  const want = vim.want;
  const length = vim.buf.lineLength(line);
  moveTo(vim, session, pos(line, want === Infinity ? length : Math.min(want, length)), want);
}

function oneCommand(vim, session) {
  vim.insertReturn = { session, from: { ...vim.cursor }, armed: false };
  vim.insert = null;
  vim.mode = "normal";
}

/** <Esc>: finish the session (repeat it for a count, fill a block) and go back to normal. */
export function leaveInsert(vim) {
  const session = vim.insert;
  dropUnusedIndent(vim);
  // Leaving a table row lines its table up (the cursor stays on its text).
  if (!session.block && isTableLine(vim.buf.lines, vim.cursor.line)) realignAt(vim);
  let cursor;
  if (session.block) {
    finishBlock(vim, session);
    cursor = pos(session.block.top, session.block.left);
  } else {
    if (session.count > 1) repeatSession(vim, session);
    cursor = pos(vim.cursor.line, Math.max(0, vim.cursor.col - 1));
  }
  vim.marks.set("^", vim.cursor);
  vim.insert = null;
  vim.insertReturn = null;
  vim.mode = "normal";
  vim.setCursor(cursor);
  if (vim.recording) {
    const { insertKeys, ...change } = vim.recording;
    vim.lastChange = { ...change, body: [...change.body, ...insertKeys, "<Esc>"] };
    vim.recording = null;
  }
}

function repeatSession(vim, session) {
  session.replaying = true;
  for (let copy = 1; copy < session.count; copy += 1) {
    if (session.kind === "o" || session.kind === "O") vim.setCursor(openLine(vim, true));
    for (const key of session.keys) insertKey(vim, key);
  }
  session.replaying = false;
}

// What was typed on the block's first line is copied onto the others.
function finishBlock(vim, session) {
  const { top, bottom, col, append, toEnd } = session.block;
  if (vim.cursor.line !== top || vim.cursor.col < session.start.col) return;
  const text = vim.buf.line(top).slice(session.start.col, vim.cursor.col);
  if (!text) return;
  for (let line = top + 1; line <= bottom; line += 1) {
    const length = vim.buf.lineLength(line);
    if (!append && length < col) continue;
    const at = toEnd ? length : col;
    const padding = " ".repeat(Math.max(0, at - length));
    vim.edit(pos(line, Math.min(at, length)), pos(line, Math.min(at, length)), padding + text);
  }
}

const HANDLERS = {
  leave: leaveInsert,
  newline,
  // Shift-Enter: the cell above on a table row, else a new line like Enter.
  lineUp: (vim, session) => (inTable(vim) ? moveCell(vim, "up") : newline(vim, session)),
  tab,
  unindent,
  backspace,
  deleteChar,
  deleteToStart,
  insertRegister: (vim, session) => {
    session.awaitingRegister = true;
  },
  oneCommand,
  // Ctrl-Space: the element shows the completion list (vim knows nothing of it).
  complete: (vim) => vim.emit("complete"),
  moveLeft: (vim, session) => {
    if (vim.cursor.col > 0) moveTo(vim, session, pos(vim.cursor.line, vim.cursor.col - 1));
  },
  moveRight: (vim, session) => {
    if (vim.cursor.col < vim.buf.lineLength(vim.cursor.line)) moveTo(vim, session, pos(vim.cursor.line, vim.cursor.col + 1));
  },
  moveUp: (vim, session) => moveVertical(vim, session, -1),
  moveDown: (vim, session) => moveVertical(vim, session, 1),
  moveHome: (vim, session) => moveTo(vim, session, pos(vim.cursor.line, 0)),
  moveEnd: (vim, session) => moveTo(vim, session, pos(vim.cursor.line, vim.buf.lineLength(vim.cursor.line)), Infinity),
};
