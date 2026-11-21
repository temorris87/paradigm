// <pd-editor>: a Vim editor as a Web Component. It knows nothing about notes.
//
//   editor.value = "text";            // set the text (undo history starts over)
//   editor.value                      // read it
//   editor.readOnly = true;           // or the readonly attribute
//   editor.showMessage("Saved");      // a message in the status line
//   <pd-editor syntax="plain">        // no Markdown colouring
//
// Events: "change" (the text changed, on every edit), "save" (:w, :x, ZZ), "quit" (:q, :x,
// ZZ, ZQ; detail.force for :q!) and "mode" (detail.mode). Each carries detail.value.
//
// A hidden textarea holds the focus and takes the keys, so IME input, dead keys and paste
// work as usual. Tab and Shift-Tab indent in insert mode; in every other mode they are not
// taken, so they move the focus on, like on any page.
import { isTextKey, keyName } from "./key-names.js";
import { BOUND_KEYS, INSERT_ONLY_KEYS } from "./keys.js";
import { EditorView } from "./render.js";
import { Vim } from "./vim.js";

const STYLESHEET = new URL("../../css/editor.css", import.meta.url).href;
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
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLESHEET;
    this.frame = element("div", "pd-editor");
    this.textArea = element("div", "pd-text");
    this.statusLine = element("div", "pd-status");
    this.input = element("textarea", "pd-input");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("autocomplete", "off");
    this.input.setAttribute("spellcheck", "false");
    this.input.setAttribute("aria-label", this.getAttribute("aria-label") || "Text editor");
    this.frame.append(this.textArea, this.statusLine, this.input);
    root.append(link, this.frame);
    link.addEventListener("load", () => this.measure());

    this.vim = new Vim({ clipboard });
    this.view = new EditorView({ text: this.textArea, status: this.statusLine });
    this.queue = [];
    this.busy = false;
    this.composing = false;
    this.seen = { version: this.vim.buf.version, mode: this.vim.mode, bells: 0 };
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
    input.addEventListener("focus", () => this.render());
    input.addEventListener("blur", () => this.render());
    this.textArea.addEventListener("mousedown", (event) => this.onMouseDown(event));
    this.textArea.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.frame.addEventListener("animationend", () => this.frame.classList.remove("pd-editor--bell"));
    this.resizeObserver = new ResizeObserver(() => this.measure());
  }

  connectedCallback() {
    this.resizeObserver.observe(this.textArea);
    this.measure();
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
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
    this.render();
  }

  get mode() {
    return this.vim.mode;
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

  showMessage(text, { error = false } = {}) {
    this.vim.message = { text, error };
    this.render();
  }

  // ---- input ---------------------------------------------------------------------------

  onKeyDown(event) {
    if (event.isComposing || this.composing || event.key === "Process" || event.key === "Dead") return;
    const name = keyName(event);
    if (!name) return;
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
    const text = event.clipboardData?.getData("text/plain");
    if (text && this.acceptsText()) this.enqueue({ paste: text.replace(/\r\n?/g, "\n") });
  }

  onMouseDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.input.focus();
    const at = this.view.positionAt(event.clientX, event.clientY);
    if (!at) return;
    this.vim.click(at);
    this.render();
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
        this.vim.feed(key);
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
    for (const { type, ...detail } of vim.takeEvents()) {
      this.dispatchEvent(new CustomEvent(type, { detail: { ...detail, value } }));
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
    this.view.render(this.vim, { syntax: this.getAttribute("syntax") !== "plain" });
    this.placeInput();
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

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

if (!customElements.get("pd-editor")) customElements.define("pd-editor", PdEditor);
