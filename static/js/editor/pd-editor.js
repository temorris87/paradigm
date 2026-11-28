// <pd-editor>: a Vim editor as a Web Component. It knows nothing about notes.
//
//   editor.value = "text";            // set the text (undo history starts over)
//   editor.value                      // read it
//   editor.readOnly = true;           // or the readonly attribute
//   editor.showMessage("Saved");      // a message in the status line
//   <pd-editor syntax="plain">        // no Markdown colouring
//   editor.addExCommand("edit", 1);   // :e and :edit now send an "ex" event
//   editor.modified = true;           // [+] in the status line
//   editor.goToLine(12);              // cursor to a line (0-based)
//   editor.insertText("text");        // at the cursor, as if pasted (see "files" below)
//   editor.insertText("a\nb", { asLines: true, line: 4 })  // whole lines below line 4
//   editor.insertLines("a\nb", { cursorAt: 1 })   // below the cursor's line; the cursor on "b"
//   editor.insertLines("a\n‹b›", { insert: true })   // and insert mode in them, at their first
//                                     // ‹blank› (taken out), else their start: one undo step;
//                                     // with cursorAt and no blank, at the end of that line
//   editor.replaceLine(4, "- [x] Done")  // one line's text from the host: one undo step, the
//                                     // cursor stays; resolves false in insert mode (not done)
//   editor.selectedText                // the visual selection's text, or null
//   editor.table                       // the Markdown table at the cursor: null, or { column,
//                                     // columns, title (the column's header), align }
//   editor.tableCommand("tsort", "!") // a table command from the host's menu: "table" [cols
//                                     // rows], "tsort" [column | "!"], "talign" left|center|right,
//                                     // "tcopy"; insert or visual mode is left first
//   editor.completions = { "@": (query) => [item] }   // a list under the cursor in insert mode
//                                     // while "@query" is typed (a word start): item
//                                     // { label, detail?, insert } puts insert in place of
//                                     // "@query"; { label, run(query) } calls run, which may
//                                     // resolve to the text to put there
//   editor.contextCompletion = ({ lines, row, col, forced }) => null | { replace, items,
//                                     // head?, foot? }: a list with no trigger character, the
//                                     // source deciding from the cursor's place; Ctrl-Space
//                                     // asks it with forced (completion.js)
//   editor.blankScope = (lines, line) => null | { first, last }   // blanks on: in insert mode
//                                     // Tab takes the next ‹blank› in those lines (wrapping);
//                                     // a taken completion's first ‹blank› goes at once
//   <pd-editor compact>               // the status line shows only while it has the focus
//   editor.hints = { status(text, cursor), line(lineText), cmdline(text) }   // the host's words: status
//                                     // at the status line's right (cursor: { line, col }); line under the cursor's
//                                     // line in insert mode; cmdline over the command line
//                                     // while typing one. Each returns "" for none
//   editor.setLineMarks([{ line, glyph, label, tone }])   // marks the host puts on lines: glyph
//                                     // in the gutter, label as a chip (ui/chip.js, in tone) at
//                                     // the line's right; [] for none. Lines are 0-based; the
//                                     // host sets them again after a change (they don't move)
//   <pd-editor><div slot="dock">      // a panel the host docks at the foot of the text, over
//                                     // the status line: it pushes the text up, never covers it
//
// The text is always raw Markdown, its syntax coloured: no block is ever drawn rendered.
//
// The leader: \t \q \d in normal mode send "capture" (detail { kind: "task" | "question" |
// "decision", line, text: the line's }); in visual mode the same with the selection's text
// joined to one line (detail.selection true; line: where it starts); \u sends "uncapture"
// (detail { line, text }). After \, any other key, or none within a second, cancels quietly.
//
// Events: "change" (the text changed, on every edit), "save" (:w, :x, ZZ; detail.force for
// :w!), "quit" (:q, :x, ZZ, ZQ; detail.force for :q!), "mode" (detail.mode) and "ex" (a
// command added with addExCommand: detail.name, .arg, .bang). Each carries detail.value.
// "cursor": after a key or a click that moved the cursor or changed the mode, detail
// { line, col, mode } (0-based; mode the engine's mode name), for a host showing where it is.
//
// "menu": a right-click, or the context-menu key (Shift-F10, Menu), detail.text: the visual
// selection's text or null, detail.table: editor.table where it was clicked, detail.x / .y
// where to show a menu. A right-click outside a selection moves the cursor there first.
// Cancel it (preventDefault) to keep the browser's own menu away.
//
// Tables: on a table row in insert mode Tab / Shift-Tab go to the next / previous cell, Enter
// / Shift-Enter the same cell a row down / up (a new row at the end); the table lines itself
// up. Cells pasted from Excel or Word become a table. :table, :tsort, :talign and :tcopy (a
// table on the clipboard as HTML + Tab text) are the editor's own commands (table-edit.js).
//
// "files": images pasted in insert mode (detail.how "paste"; they win over any text on the
// clipboard too) or files dropped on the text in any mode (detail.how "drop", detail.line
// the line they were dropped on). detail.files holds the File objects. The editor does
// nothing more with them: the host stores them and calls insertText with what to add.
//
// A hidden textarea holds the focus and takes the keys, so IME input, dead keys and paste
// work as usual. Tab and Shift-Tab indent in insert mode; in every other mode they are not
// taken, so they move the focus on, like on any page. Ctrl-Space too is only insert mode's.
import { copyRich } from "../ui/clipboard.js";
import { isTextKey, keyName } from "./key-names.js";
import { BOUND_KEYS, INSERT_ONLY_KEYS, LEADER_TIMEOUT_MS } from "./keys.js";
import { Completion } from "./completion.js";
import { tableInfo } from "./table-edit.js";
import { EditorView } from "./render.js";
import { Vim } from "./vim.js";

// chip.css: the line marks' chips are the shared status chip.
const STYLESHEETS = [new URL("../../css/chip.css", import.meta.url).href, new URL("../../css/editor.css", import.meta.url).href];
const PASTE_KEYS = new Set(["<C-v>", "<C-S-v>", "<S-Insert>"]);
const WHEEL_LINES = 3;

const clipboard = {
  writeText: (text) => navigator.clipboard?.writeText(text).catch(() => {}),
};

export class PdEditor extends HTMLElement {
  static observedAttributes = ["readonly", "syntax"];

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open", delegatesFocus: true });
    const links = STYLESHEETS.map((href) => Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
    this.frame = element("div", "pd-editor");
    this.textArea = element("div", "pd-text");
    this.statusLine = element("div", "pd-status");
    this.input = element("textarea", "pd-input");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("autocomplete", "off");
    this.input.setAttribute("spellcheck", "false");
    this.input.setAttribute("aria-label", this.getAttribute("aria-label") || "Text editor");
    // The host's docked panel (a capture sheet): between the text and the status line.
    this.dock = document.createElement("slot");
    this.dock.name = "dock";
    this.frame.append(this.textArea, this.dock, this.statusLine, this.input);
    root.append(...links, this.frame);
    // The row height and character width are only right once the stylesheet is in.
    for (const link of links) link.addEventListener("load", () => this.measure());

    this.vim = new Vim({ clipboard });
    this.completion = new Completion(this.frame, {
      accept: (length, text) => this.replaceBeforeCursor(length, text),
      onRun: () => this.input.focus(),
    });
    this.view = new EditorView({ text: this.textArea, status: this.statusLine });
    this.hintBox = element("div", "pd-hint");
    this.hintBox.hidden = true;
    this.frame.append(this.hintBox);
    this.hints = {};
    this.lineMarks = [];
    this.leaderTimer = null;
    this.queue = [];
    this.busy = false;
    this.composing = false;
    this.seen = { version: this.vim.buf.version, mode: this.vim.mode, bells: 0, cursor: cursorKey(this.vim) };
    this.listen();
  }

  listen() {
    const input = this.input;
    input.addEventListener("keydown", (event) => this.onKeyDown(event));
    input.addEventListener("input", (event) => {
      if (!event.isComposing && !this.composing) this.flushInput();
    });
    input.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    input.addEventListener("compositionend", () => {
      this.composing = false;
      this.flushInput();
    });
    input.addEventListener("paste", (event) => this.onPaste(event));
    this.textArea.addEventListener("dragover", (event) => this.onDragOver(event));
    this.textArea.addEventListener("drop", (event) => this.onDrop(event));
    input.addEventListener("focus", () => this.render());
    input.addEventListener("blur", () => this.render());
    this.textArea.addEventListener("mousedown", (event) => this.onMouseDown(event));
    this.frame.addEventListener("contextmenu", (event) => this.onContextMenu(event));
    this.textArea.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.frame.addEventListener("animationend", () => this.frame.classList.remove("pd-editor--bell"));
    this.resizeObserver = new ResizeObserver(() => this.measure());
    // A row measured before the font arrived was measured in a fallback font.
    this.onFontsLoaded = () => this.measure();
  }

  connectedCallback() {
    this.resizeObserver.observe(this.textArea);
    document.fonts?.addEventListener("loadingdone", this.onFontsLoaded);
    this.measure();
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    document.fonts?.removeEventListener("loadingdone", this.onFontsLoaded);
  }

  attributeChangedCallback(name) {
    if (name === "readonly") this.vim.readOnly = this.hasAttribute("readonly");
    this.render();
  }

  get value() {
    return this.vim.text;
  }

  set value(text) {
    this.vim.setText(text ?? "");
    this.seen.version = this.vim.buf.version;
    this.seen.mode = this.vim.mode;
    this.seen.cursor = cursorKey(this.vim); // new text from the host is no cursor move
    this.render();
  }

  get mode() {
    return this.vim.mode;
  }

  /** Puts the cursor at the start of a line (0-based), scrolling it into view. */
  goToLine(line) {
    this.vim.click({ line: Math.max(0, Math.min(line, this.vim.buf.lastLine)), col: 0 });
    this.render();
    this.reportCursor();
  }

  get selectedText() {
    return this.vim.selectedText();
  }

  get table() {
    return tableInfo(this.vim);
  }

  tableCommand(name, arg = "") {
    const bang = arg === "!" ? "!" : "";
    this.input.focus();
    this.enqueue(() => this.vim.exFromOutside(`${name}${bang}${bang ? "" : ` ${arg}`}`.trim()));
  }

  get completions() {
    return this.completion.sources;
  }

  set completions(sources) {
    this.completion.sources = sources ?? {};
  }

  get contextCompletion() {
    return this.completion.context;
  }

  set contextCompletion(source) {
    this.completion.context = typeof source === "function" ? source : null;
  }

  get blankScope() {
    return this.vim.blankScope;
  }

  set blankScope(scope) {
    this.vim.blankScope = typeof scope === "function" ? scope : null;
  }

  addExCommand(name, minLength = name.length) {
    this.vim.exCommands.set(name, minLength);
  }

  get modified() {
    return Boolean(this._modified);
  }

  set modified(flag) {
    if (this._modified === Boolean(flag)) return;
    this._modified = Boolean(flag);
    this.render();
  }

  get readOnly() {
    return this.hasAttribute("readonly");
  }

  set readOnly(flag) {
    this.toggleAttribute("readonly", Boolean(flag));
  }

  focus(options) {
    this.input.focus(options);
  }

  setLineMarks(marks) {
    this.lineMarks = Array.isArray(marks) ? marks : [];
    this.render();
  }

  showMessage(text, { error = false } = {}) {
    this.vim.message = { text, error };
    this.render();
  }

  // ---- input ---------------------------------------------------------------------------

  onKeyDown(event) {
    if (event.isComposing || this.composing || event.key === "Process" || event.key === "Dead") return;
    const name = keyName(event);
    if (!name) return;
    if (this.completion.open && this.completion.onKey(name)) {
      event.preventDefault();
      return;
    }
    if (INSERT_ONLY_KEYS.has(name) && !this.vim.isInsertLike()) return;
    // In insert and command-line mode the browser pastes, and the paste event brings the text.
    if (PASTE_KEYS.has(name) && this.acceptsText()) return;
    if (!isTextKey(name) && !BOUND_KEYS.has(name)) return;
    event.preventDefault();
    this.enqueue(name);
  }

  acceptsText() {
    return this.vim.isInsertLike() || this.vim.mode === "cmdline";
  }

  // Text the textarea received (dead keys, IME): feed it in, then empty the textarea.
  flushInput() {
    const text = this.input.value;
    this.input.value = "";
    for (const char of text.replace(/\r\n?/g, "\n")) this.enqueue(char === "\n" ? "<CR>" : char);
  }

  onPaste(event) {
    event.preventDefault();
    const images = imageFiles(event.clipboardData);
    if (images.length > 0 && this.vim.isInsertLike()) {
      this.emitEvent("files", { files: images, how: "paste" });
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text && this.acceptsText()) this.enqueue({ paste: text.replace(/\r\n?/g, "\n") });
  }

  onDragOver(event) {
    if (!carriesFiles(event.dataTransfer)) return;
    event.preventDefault(); // without this the drop never comes
    event.dataTransfer.dropEffect = "copy";
  }

  onDrop(event) {
    if (!carriesFiles(event.dataTransfer)) return;
    event.preventDefault(); // the browser would open the file in place of the app
    const files = [...event.dataTransfer.files];
    if (files.length === 0) return;
    const line = this.view.positionAt(event.clientX, event.clientY)?.line ?? this.vim.cursor.line;
    this.input.focus();
    this.emitEvent("files", { files, how: "drop", line });
  }

  /** Text from the host. Typed in like a paste in insert mode; otherwise one undo step. */
  insertText(text, { asLines = false, line = null } = {}) {
    const clean = String(text).replace(/\r\n?/g, "\n");
    if (!asLines && this.vim.isInsertLike()) this.enqueue({ paste: clean });
    else this.enqueue(() => this.vim.putFromOutside(clean, { asLines, line }));
  }

  /** Whole lines from the host below the cursor's line (one undo step); cursorAt (a line of
   * text, 0-based) puts the cursor there afterwards, else it stays on the first new line.
   * With insert, insert mode starts at their first ‹blank›, else at the end of line cursorAt. */
  insertLines(text, { cursorAt = null, insert = false } = {}) {
    const clean = String(text).replace(/\r\n?/g, "\n");
    if (insert) {
      this.input.focus();
      this.enqueue(() => this.vim.insertLinesFromOutside(clean, null, { cursorAt }));
      return;
    }
    this.enqueue(() => {
      const at = this.vim.cursor.line;
      this.vim.putFromOutside(clean, { asLines: true, line: at });
      if (cursorAt !== null) this.vim.click({ line: Math.min(at + 1 + cursorAt, this.vim.buf.lastLine), col: 0 });
    });
  }

  replaceLine(line, text) {
    return new Promise((resolve) => this.enqueue(() => resolve(this.vim.replaceLineFromOutside(line, text))));
  }

  onMouseDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.input.focus();
    const at = this.view.positionAt(event.clientX, event.clientY);
    if (!at) return;
    this.vim.click(at);
    this.render();
    this.reportCursor();
    this.followDrag(at);
  }

  // Dragging with the button held selects, as in Vim with the mouse on.
  followDrag(from) {
    const move = (event) => {
      if (!(event.buttons & 1)) return stop();
      const to = this.view.positionAt(event.clientX, event.clientY);
      if (!to || (to.line === from.line && to.col === from.col && this.vim.mode !== "visual")) return undefined;
      this.vim.drag(from, to);
      this.afterFeed();
      return undefined;
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }

  onContextMenu(event) {
    // The docked panel is the host's: its own menu, if any.
    if (event.composedPath().includes(this.dock)) return;
    const fromKey = event.button !== 2 || (event.clientX === 0 && event.clientY === 0);
    // A right-click on the text puts the cursor there (a selection stays as it is), so what the
    // menu offers is about the place clicked: a table's column, say.
    if (!fromKey && this.vim.mode !== "visual" && this.textArea.contains(event.target)) {
      const at = this.view.positionAt(event.clientX, event.clientY);
      if (at) {
        this.vim.click(at);
        this.render();
        this.reportCursor();
      }
    }
    // The context-menu key comes with no pointer position: show the menu at the cursor.
    const box = this.view.cursorBox();
    const x = fromKey && box ? box.left : event.clientX;
    const y = fromKey && box ? box.bottom : event.clientY;
    const menu = new CustomEvent("menu", { cancelable: true,
      detail: { text: this.vim.selectedText(), table: tableInfo(this.vim), x, y, value: this.vim.text } });
    this.dispatchEvent(menu);
    if (menu.defaultPrevented) event.preventDefault();
  }

  /** Completion: length characters before the cursor give way to text (insert mode only).
   * With blanks on, the text's first ‹blank› is taken out, the cursor there. */
  replaceBeforeCursor(length, text) {
    if (!this.vim.isInsertLike()) return;
    this.input.focus();
    let from = null;
    this.enqueue(() => {
      from = { line: this.vim.cursor.line, col: Math.max(0, this.vim.cursor.col - length) };
    });
    for (let index = 0; index < length; index += 1) this.enqueue("<BS>");
    this.enqueue({ paste: text });
    if (this.vim.blankScope && text.includes("‹")) this.enqueue(() => this.vim.takeBlankBefore(from));
  }

  onWheel(event) {
    if (event.deltaY === 0) return;
    event.preventDefault();
    this.vim.scrollView(Math.sign(event.deltaY) * WHEEL_LINES);
    this.render();
  }

  enqueue(key) {
    this.queue.push(key);
    this.pump();
  }

  // Keys run in order. Naming the clipboard register ("+ or "*) waits for the browser to hand
  // over the clipboard; keys typed meanwhile queue up behind it.
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const key = this.queue.shift();
        if ((key === "+" || key === "*") && this.vim.awaitingRegister()) await this.readClipboard();
        if (typeof key === "function") key();
        else this.vim.feed(key);
        this.afterFeed();
      }
    } finally {
      this.busy = false;
    }
  }

  async readClipboard() {
    try {
      this.vim.registers.setClipboardText(await navigator.clipboard.readText());
    } catch {
      this.vim.registers.setClipboardText(null);
    }
  }

  afterFeed() {
    const vim = this.vim;
    const value = vim.text;
    let forceCompletion = false;
    for (const { type, ...detail } of vim.takeEvents()) {
      if (type === "copytable") this.copyTable(detail);
      else if (type === "complete") forceCompletion = true;
      else this.emitEvent(type, detail);
    }
    if (vim.buf.version !== this.seen.version) {
      this.seen.version = vim.buf.version;
      this.dispatchEvent(new CustomEvent("change", { detail: { value } }));
    }
    if (vim.mode !== this.seen.mode) {
      this.seen.mode = vim.mode;
      this.dispatchEvent(new CustomEvent("mode", { detail: { mode: vim.mode, value } }));
    }
    if (vim.bellCount !== this.seen.bells) {
      this.seen.bells = vim.bellCount;
      this.frame.classList.remove("pd-editor--bell");
      void this.frame.offsetWidth; // restart the animation
      this.frame.classList.add("pd-editor--bell");
    }
    this.render();
    this.reportCursor();
    this.timeLeader();
    const show = forceCompletion ? "force" : "update";
    this.completion[show](vim, () => this.view.cursorBox(), this.frame.getBoundingClientRect());
  }

  // The leader waits a second for its key, then goes quietly.
  timeLeader() {
    clearTimeout(this.leaderTimer);
    this.leaderTimer = null;
    if (!this.vim.leaderPending()) return;
    this.leaderTimer = setTimeout(() => this.enqueue(() => this.vim.cancelLeader()), LEADER_TIMEOUT_MS);
  }

  /** "cursor" when the cursor or the mode moved since the last one. */
  reportCursor() {
    const { line, col } = this.vim.cursor;
    const mode = this.vim.mode;
    const key = cursorKey(this.vim);
    if (key === this.seen.cursor) return;
    this.seen.cursor = key;
    this.dispatchEvent(new CustomEvent("cursor", { detail: { line, col, mode } }));
  }

  async copyTable({ html, text, message }) {
    try {
      await copyRich(html, text);
      this.showMessage(message);
    } catch {
      this.showMessage("The browser did not let the table onto the clipboard", { error: true });
    }
  }

  emitEvent(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail: { ...detail, value: this.vim.text } }));
  }

  // ---- drawing -------------------------------------------------------------------------

  measure() {
    if (!this.isConnected) return;
    const { height, width } = this.view.measure();
    this.vim.resize(height, width);
    this.render();
  }

  render() {
    this.frame.classList.toggle("pd-editor--focused", this.shadowRoot.activeElement === this.input);
    const note = this.hints?.status?.(this.vim.text, { line: this.vim.cursor.line, col: this.vim.cursor.col }) ?? "";
    this.view.render(this.vim, { syntax: this.getAttribute("syntax") !== "plain", modified: this.modified, note, marks: this.lineMarks });
    this.placeInput();
    this.showHint();
  }

  /** The host's hint: over the command line, or under the cursor's line in insert mode. */
  showHint() {
    const vim = this.vim;
    const cmdline = vim.mode === "cmdline";
    const text = cmdline ? this.hints?.cmdline?.(vim.cmdline.type + vim.cmdline.text) ?? ""
      : vim.mode === "insert" ? this.hints?.line?.(vim.buf.line(vim.cursor.line)) ?? "" : "";
    this.hintBox.hidden = !text;
    this.hintBox.classList.toggle("pd-hint--cmdline", cmdline);
    if (!text) return;
    this.hintBox.textContent = text;
    const frame = this.frame.getBoundingClientRect();
    if (cmdline) {
      this.hintBox.style.left = "";
      this.hintBox.style.top = "";
      return;
    }
    const box = this.view.cursorBox();
    if (!box) return;
    this.hintBox.style.left = `${Math.max(0, box.left - frame.left)}px`;
    this.hintBox.style.top = `${box.bottom - frame.top + 4}px`;
  }

  // Keep the hidden textarea at the cursor, so an IME shows its window in the right place.
  placeInput() {
    const box = this.view.cursorBox();
    if (!box) return;
    const frame = this.frame.getBoundingClientRect();
    this.input.style.left = `${box.left - frame.left}px`;
    this.input.style.top = `${box.top - frame.top}px`;
  }
}

// Image files on the clipboard. A copied screenshot comes only as a file; a copy from a web
// page or Word may bring text with it, and the image is what was meant.
function imageFiles(data) {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"));
}

function cursorKey(vim) {
  return `${vim.cursor.line}:${vim.cursor.col}:${vim.mode}`;
}

function carriesFiles(data) {
  return Boolean(data && [...data.types].includes("Files"));
}

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

if (!customElements.get("pd-editor")) customElements.define("pd-editor", PdEditor);
