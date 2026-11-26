// The Vim engine: all editor state, and feed(key) to act on one key. It never touches the
// DOM, so tests drive it with plain key names. The <pd-editor> element feeds it keys, reads
// its state to draw, and turns vim.events into DOM events.
import { Buffer } from "./buffer.js";
import { cmdlineKey, startCmdline } from "./cmdline.js";
import { commandKey, repeatLastChange } from "./command.js";
import { EditorError } from "./errors.js";
import { runEx } from "./ex.js";
import { insertKey } from "./insert.js";
import { Marks } from "./marks.js";
import { defaultOptions } from "./options.js";
import { clamp, endAfter, lastCol, pos } from "./position.js";
import { Registers } from "./registers.js";
import { UndoHistory } from "./undo.js";
import { ensureCursorVisible, scrollLines } from "./view.js";
import { enterVisual, exitVisual, visualRegion } from "./visual.js";

export class Vim {
  constructor({ text = "", clipboard = null } = {}) {
    this.buf = new Buffer(text);
    this.options = defaultOptions();
    this.registers = new Registers(clipboard);
    this.undo = new UndoHistory();
    this.marks = new Marks();
    this.view = { top: 0, left: 0, height: 20, width: 80 };
    this.history = { ":": [], "/": [] };
    this.search = { pattern: null, forward: true, highlight: false };
    this.readOnly = false;
    this.events = [];
    // Ex commands the host adds (name -> shortest abbreviation); running one emits "ex".
    this.exCommands = new Map();
    this.bellCount = 0;
    this.lastFind = null;
    this.lastChange = null;
    this.lastVisual = null;
    this.scrollAmount = 0;
    this.reset();
  }

  /** Everything tied to the current text goes back to the start. */
  reset() {
    this.mode = "normal";
    this.cursor = pos(0, 0);
    this.want = 0;
    this.pending = [];
    this.visual = null;
    this.insert = null;
    this.insertReturn = null;
    this.cmdline = null;
    this.incsearch = null;
    this.recording = null;
    this.replaying = false;
    this.message = null;
    this.commandStart = null;
    this.view.top = 0;
    this.view.left = 0;
  }

  get text() {
    return this.buf.getText();
  }

  /** Replace the whole text. Undo history and marks start over. */
  setText(text) {
    this.buf.setText(text);
    this.undo.clear();
    this.marks.clear();
    this.lastVisual = null;
    this.reset();
  }

  // ---- keys ----------------------------------------------------------------------------

  /** Act on one key: a Vim key name ("x", "<Esc>"), or { paste: text } for pasted text. */
  feed(key) {
    if (!this.undo.isOpen) this.commandStart = { ...this.cursor };
    try {
      this.dispatch(key);
    } catch (error) {
      if (!(error instanceof EditorError)) throw error;
      this.pending = [];
      this.recording = null;
      if (this.isInsertLike() && !this.insert) this.mode = "normal";
      this.fail(error.message);
    }
    this.afterKey();
  }

  dispatch(key) {
    if (this.isInsertLike()) insertKey(this, key);
    else if (this.mode === "cmdline") cmdlineKey(this, key);
    else commandKey(this, key);
  }

  /**
   * Text from outside the keyboard (the host adding an image link). It goes in as one undo
   * step and leaves the editor in normal mode: before the cursor, or with asLines as whole
   * lines below `line` (the cursor line by default), the cursor on the last of them.
   * Text pasted into insert mode is { paste } through feed() instead, part of that insert.
   */
  putFromOutside(text, { asLines = false, line = null } = {}) {
    if (this.mode !== "normal" || this.pending.length > 0) this.feed("<Esc>");
    this.commandStart = { ...this.cursor };
    try {
      if (asLines) this.putLinesBelow(text, clamp(line ?? this.cursor.line, 0, this.buf.lastLine));
      else this.putBeforeCursor(text);
    } catch (error) {
      if (!(error instanceof EditorError)) throw error;
      this.fail(error.message);
    }
    this.afterKey();
  }

  /** An ex command from the host (a menu item): insert or visual mode is left first, and an
   * error shows in the status line as if it had been typed. */
  exFromOutside(text) {
    if (this.mode !== "normal" || this.pending.length > 0) this.feed("<Esc>");
    if (this.mode !== "normal") this.feed("<Esc>");
    this.commandStart = { ...this.cursor };
    try {
      this.runEx(text);
    } catch (error) {
      if (!(error instanceof EditorError)) throw error;
      this.fail(error.message);
    }
    this.afterKey();
  }

  /** One line's text replaced by the host (a task box ticked elsewhere): one undo step; the
   * cursor stays where it is. In insert mode it waits: the host tries again later. */
  replaceLineFromOutside(line, text) {
    if (line < 0 || line > this.buf.lastLine || this.isInsertLike()) return false;
    const cursor = { ...this.cursor };
    this.commandStart = cursor;
    this.edit(pos(line, 0), pos(line, this.buf.lineLength(line)), text);
    this.setCursor(cursor);
    this.clampCursor();
    this.afterKey();
    return true;
  }

  putLinesBelow(text, line) {
    const end = pos(line, this.buf.lineLength(line));
    this.edit(end, end, `\n${text}`);
    this.setCursor(pos(line + text.split("\n").length, 0));
  }

  putBeforeCursor(text) {
    const at = { ...this.cursor };
    this.edit(at, at, text);
    const end = endAfter(at, text);
    this.setCursor(pos(end.line, Math.max(0, end.col - 1)));
  }

  /** Run keys as part of the current command (used by :undo and :redo). */
  feedKeysNow(keys) {
    for (const key of keys) this.dispatch(key);
  }

  afterKey() {
    if (!this.isInsertLike()) this.undo.end();
    this.returnFromOneCommand();
    if (this.mode === "normal" && this.pending.length === 0) this.clampCursor();
    ensureCursorVisible(this);
  }

  // Ctrl-O in insert mode runs one normal command, then insert mode resumes.
  returnFromOneCommand() {
    const pending = this.insertReturn;
    if (!pending) return;
    if (this.isInsertLike()) {
      this.insertReturn = null;
      return;
    }
    if (!pending.armed) {
      pending.armed = true;
      return;
    }
    if (this.mode !== "normal" || this.pending.length > 0) return;
    this.insertReturn = null;
    this.mode = "insert";
    this.insert = pending.session;
    const length = this.buf.lineLength(this.cursor.line);
    const unmoved = this.cursor.line === pending.from.line && this.cursor.col === clamp(pending.from.col, 0, lastCol(this.buf.line(pending.from.line)));
    if (this.want === Infinity) this.cursor = pos(this.cursor.line, length);
    else if (unmoved) this.cursor = pos(pending.from.line, Math.min(pending.from.col, length));
    this.insert.start = { ...this.cursor };
  }

  repeatLastChange(count) {
    repeatLastChange(this, count);
  }

  startCmdline(type, text = "", pendingCmd = null) {
    startCmdline(this, type, text, pendingCmd);
  }

  runEx(text) {
    runEx(this, text);
  }

  // ---- from the page --------------------------------------------------------------------

  /** The editor area changed size (in character rows and columns). */
  resize(height, width) {
    this.view.height = Math.max(1, height);
    this.view.width = Math.max(1, width);
    ensureCursorVisible(this);
  }

  /** A mouse click on a text position: move there (ends a visual selection). */
  click(at) {
    if (this.mode === "cmdline") return;
    if (this.mode === "visual") exitVisual(this);
    this.pending = [];
    this.setCursor(at);
    if (!this.isInsertLike()) this.clampCursor();
    ensureCursorVisible(this);
  }

  /** The mouse dragged from one text position to another: a character selection between
   * them, as Vim's mouse does (insert mode is left first). */
  drag(from, to) {
    if (this.mode === "cmdline") return;
    if (this.isInsertLike()) this.feed("<Esc>");
    if (this.mode !== "visual") {
      this.pending = [];
      this.setCursor(from);
      this.clampCursor();
      enterVisual(this, "char");
    }
    this.setCursor(to);
    this.clampCursor();
    ensureCursorVisible(this);
  }

  /** The selected text in visual mode (whole lines in line mode), else null. */
  selectedText() {
    if (this.mode !== "visual" || !this.visual) return null;
    const region = visualRegion(this);
    if (region.kind === "line") return this.buf.lines.slice(region.first, region.last + 1).join("\n");
    if (region.kind === "block") {
      return this.buf.lines.slice(region.top, region.bottom + 1)
        .map((line) => line.slice(region.left, region.toEnd ? undefined : region.right)).join("\n");
    }
    const { start, end } = region;
    if (start.line === end.line) return this.buf.line(start.line).slice(start.col, end.col);
    const lines = [this.buf.line(start.line).slice(start.col)];
    for (let line = start.line + 1; line < end.line; line += 1) lines.push(this.buf.line(line));
    lines.push(this.buf.line(end.line).slice(0, end.col));
    return lines.join("\n");
  }

  /** The mouse wheel: scroll by rows, keeping the cursor on screen. */
  scrollView(rows) {
    if (scrollLines(this, rows)) ensureCursorVisible(this);
  }

  /** Something outside the engine changed how tall lines are (a resize). */
  relayout() {
    ensureCursorVisible(this);
  }

  // ---- state ---------------------------------------------------------------------------

  isInsertLike() {
    return this.mode === "insert" || this.mode === "replace";
  }

  /** Waiting for a register name? The element then reads the clipboard first for "+ and "*. */
  awaitingRegister() {
    if (this.isInsertLike()) return Boolean(this.insert?.awaitingRegister);
    if (this.mode === "cmdline") return Boolean(this.cmdline?.awaitingRegister);
    return this.pending.length > 0 && this.pending[this.pending.length - 1] === '"';
  }

  /** The column for a vertical move to `line`, from the remembered column. */
  wantedCol(line) {
    const text = this.buf.line(line);
    const max = this.isInsertLike() ? text.length : lastCol(text);
    return this.want === Infinity ? max : Math.min(this.want, max);
  }

  setCursor(at, { keepWant = false } = {}) {
    const line = clamp(at.line, 0, this.buf.lastLine);
    this.cursor = pos(line, clamp(at.col, 0, this.buf.lineLength(line)));
    if (!keepWant) this.want = this.cursor.col;
  }

  moveToLine(line, { keepWant = false } = {}) {
    this.cursor = pos(line, this.wantedCol(line));
    if (!keepWant) this.want = this.cursor.col;
  }

  clampCursor() {
    const line = clamp(this.cursor.line, 0, this.buf.lastLine);
    this.cursor = pos(line, Math.min(this.cursor.col, lastCol(this.buf.line(line))));
  }

  setSearch(pattern, forward) {
    this.search = { pattern, forward, highlight: true };
    this.registers.setSpecial("/", pattern);
  }

  say(text) {
    this.message = { text, error: false };
  }

  fail(text) {
    if (text) this.message = { text, error: true };
    this.bell();
  }

  bell() {
    this.bellCount += 1;
  }

  emit(type, detail = {}) {
    this.events.push({ type, ...detail });
  }

  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  // ---- editing -------------------------------------------------------------------------

  checkWritable() {
    if (this.readOnly) throw new EditorError("E21: Cannot make changes, the text is read-only");
  }

  /** Every change to the text goes through here, so it lands in undo and moves the marks. */
  edit(start, end, text) {
    this.checkWritable();
    this.undo.begin(this.commandStart ?? this.cursor);
    const change = this.buf.replace(start, end, text);
    this.undo.record(change);
    this.marks.adjust(change);
    return change;
  }

  afterHistory(result) {
    for (const change of result.changes) this.marks.adjust(change);
    this.setCursor(result.cursor);
    this.clampCursor();
  }

  startInsert(at, { count = 1, kind = "i", replace = false } = {}) {
    this.checkWritable();
    this.visual = null;
    this.mode = replace ? "replace" : "insert";
    const line = clamp(at.line, 0, this.buf.lastLine);
    this.setCursor(pos(line, Math.min(at.col, this.buf.lineLength(line))));
    const autoIndented = (kind === "o" || kind === "O") && this.cursor.col > 0;
    this.insert = {
      start: { ...this.cursor },
      count,
      kind,
      keys: [],
      replaced: [],
      block: null,
      replaying: false,
      awaitingRegister: false,
      pendingIndent: autoIndented ? this.cursor.line : null,
    };
    this.undo.begin(this.commandStart ?? this.cursor);
  }

  /** Insert on every line of a block: typed on the top line, copied to the rest on <Esc>. */
  startBlockInsert({ top, bottom, col, left = col, append, toEnd = false }) {
    this.checkWritable();
    const length = this.buf.lineLength(top);
    if (append && !toEnd && length < col) this.edit(pos(top, length), pos(top, length), " ".repeat(col - length));
    this.startInsert(pos(top, toEnd ? this.buf.lineLength(top) : col));
    this.insert.block = { top, bottom, col, left, append, toEnd };
  }
}
