// Key names in Vim notation: plain characters stay as they are ("a", " ", "<"), other keys
// become "<Esc>", "<CR>", "<C-r>" and so on. Key sequences are arrays of these names, so a
// typed "<" is never confused with the start of a special name.

const SPECIAL_KEYS = {
  Escape: "Esc",
  Enter: "CR",
  Backspace: "BS",
  Delete: "Del",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Tab: "Tab",
};

// Shift is part of the name only where it changes the meaning (Shift-Insert pastes,
// Shift-Tab unindents, Shift-Enter goes a table row up).
const SHIFT_MATTERS = new Set(["Insert", "Tab", "CR"]);

/** The Vim name of a keydown event, or null for keys the editor never sees as input. */
export function keyName(event) {
  const special = SPECIAL_KEYS[event.key];
  if (special) return specialName(special, event);
  if ([...event.key].length !== 1) return null; // Shift, Control, F5, Dead, Process, ...
  if (event.metaKey) return null; // Cmd shortcuts belong to the browser and the OS
  if (event.key === " " && event.ctrlKey && !event.altKey) return "<C-Space>";
  // AltGr arrives as Ctrl+Alt on Windows; those keys type characters.
  if (event.ctrlKey && !event.altKey) return controlName(event);
  return event.key;
}

function specialName(name, event) {
  if (event.ctrlKey && name === "Esc") return "<Esc>";
  let prefix = event.ctrlKey ? "C-" : "";
  if (event.shiftKey && SHIFT_MATTERS.has(name)) prefix += "S-";
  return `<${prefix}${name}>`;
}

function controlName(event) {
  let base = event.key.toLowerCase();
  if (!/^[a-z0-9[\]\\^_@]$/.test(base)) {
    // Non-Latin layouts: fall back to the physical key, as Vim users expect.
    const match = /^Key([A-Z])$/.exec(event.code || "");
    if (!match) return null;
    base = match[1].toLowerCase();
  }
  if (base === "[") return "<Esc>";
  return event.shiftKey && /[a-z]/.test(base) ? `<C-S-${base}>` : `<C-${base}>`;
}

/** True for a key that types a character, as opposed to "<Esc>" and friends. */
export function isTextKey(name) {
  return typeof name === "string" && [...name].length === 1;
}

/** "d2w<Esc>" -> ["d", "2", "w", "<Esc>"]. "<lt>" stands for a literal "<". */
export function parseKeys(text) {
  const keys = [];
  let index = 0;
  while (index < text.length) {
    const match = /^<(?:[CSA]-)*[A-Za-z0-9[\]\\^_@-]+>/.exec(text.slice(index));
    if (match) {
      keys.push(match[0] === "<lt>" ? "<" : match[0]);
      index += match[0].length;
    } else {
      const char = String.fromCodePoint(text.codePointAt(index));
      keys.push(char);
      index += char.length;
    }
  }
  return keys;
}
