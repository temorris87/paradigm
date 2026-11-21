// Vim registers. A value is { text, type }: type "char", "line" (text holds whole lines,
// joined by "\n", with no final newline) or "block" (text is an array of strings, one per row).
//
// "+ and "* are the system clipboard. Reading the clipboard is asynchronous in the browser, so
// the editor element reads it into a cache (setClipboardText) just before a command names it;
// writing goes out through the injected clipboard adapter.

const NAMED = /^[a-z]$/;
const NAMED_APPEND = /^[A-Z]$/;
const READABLE = /^[a-zA-Z0-9"\-+*/:]$/;

export function isRegisterName(name) {
  return READABLE.test(name) || name === "_";
}

export class Registers {
  constructor(clipboard = null) {
    this.clipboard = clipboard; // { writeText(text) } or null
    this.values = new Map();
    this.clipboardText = null;
  }

  get(name = '"') {
    if (name === "+" || name === "*") return this.clipboardValue();
    if (NAMED_APPEND.test(name)) return this.values.get(name.toLowerCase()) ?? null;
    return this.values.get(name) ?? null;
  }

  /** A yank: goes to the named register, or to "0. Both update the unnamed register. */
  storeYank(name, value) {
    if (name === "_") return;
    if (name && name !== '"') {
      this.storeNamed(name, value);
      return;
    }
    this.values.set("0", value);
    this.values.set('"', value);
  }

  /** A delete: whole lines and multi-line text shift into "1-"9, small deletes go to "-. */
  storeDelete(name, value, { small }) {
    if (name === "_") return;
    if (name && name !== '"') {
      this.storeNamed(name, value);
      if (!small) this.shiftNumbered(this.get(name));
      return;
    }
    if (small) this.values.set("-", value);
    else this.shiftNumbered(value);
    this.values.set('"', value);
  }

  /** Read-only registers the editor keeps up to date: "/ last search, ": last command line. */
  setSpecial(name, text) {
    this.values.set(name, { text, type: "char" });
  }

  setClipboardText(text) {
    this.clipboardText = text;
  }

  storeNamed(name, value) {
    if (name === "+" || name === "*") {
      this.clipboardText = value.type === "line" ? `${value.text}\n` : blockText(value);
      this.clipboard?.writeText(this.clipboardText);
    } else if (NAMED_APPEND.test(name)) {
      const key = name.toLowerCase();
      const old = this.values.get(key);
      this.values.set(key, old ? appendValues(old, value) : value);
    } else if (NAMED.test(name)) {
      this.values.set(name, value);
    } else {
      return;
    }
    this.values.set('"', this.get(name));
  }

  shiftNumbered(value) {
    for (let index = 9; index > 1; index -= 1) {
      const previous = this.values.get(String(index - 1));
      if (previous) this.values.set(String(index), previous);
    }
    this.values.set("1", value);
  }

  clipboardValue() {
    const text = this.clipboardText;
    if (text === null || text === undefined) return null;
    const normal = text.replace(/\r\n?/g, "\n");
    if (normal.endsWith("\n")) return { text: normal.slice(0, -1), type: "line" };
    return { text: normal, type: "char" };
  }
}

function blockText(value) {
  return Array.isArray(value.text) ? value.text.join("\n") : value.text;
}

function appendValues(old, value) {
  if (old.type === "line" || value.type === "line") {
    return { text: `${blockText(old)}\n${blockText(value)}`, type: "line" };
  }
  return { text: blockText(old) + blockText(value), type: "char" };
}
