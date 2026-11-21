// Command-line mode: ":" commands and "/" "?" searches. While a search is typed, the cursor
// previews the first match (incsearch); <Esc> puts it back.
import { completeSearch } from "./command.js";
import { CMDLINE_KEYS, findKey } from "./keys.js";
import { isTextKey } from "./key-names.js";
import { compilePattern, findMatch } from "./search.js";

const HISTORY_LIMIT = 100;

export function startCmdline(vim, type, text = "", pendingCmd = null) {
  vim.cmdline = {
    type,
    text,
    pendingCmd,
    origin: { ...vim.cursor },
    originTop: vim.view.top,
    originWant: vim.want,
    prevMode: vim.mode,
    visual: vim.visual,
    historyIndex: null,
    awaitingRegister: false,
  };
  vim.mode = "cmdline";
}

export function cmdlineKey(vim, key) {
  const line = vim.cmdline;
  if (line.awaitingRegister) {
    line.awaitingRegister = false;
    const value = vim.registers.get(key);
    if (value) line.text += (Array.isArray(value.text) ? value.text[0] : value.text).split("\n")[0];
  } else {
    const entry = typeof key === "string" ? findKey(CMDLINE_KEYS, key) : null;
    if (entry) {
      HANDLERS[entry.name](vim, line);
      return;
    }
    if (typeof key === "object" && key.paste !== undefined) line.text += key.paste.split("\n")[0];
    else if (isTextKey(key)) line.text += key;
    else return;
  }
  previewSearch(vim);
}

function isSearch(line) {
  return line.type === "/" || line.type === "?";
}

function previewSearch(vim) {
  const line = vim.cmdline;
  if (!line || !isSearch(line)) return;
  vim.incsearch = null;
  vim.cursor = { ...line.origin };
  if (!vim.options.incsearch || !line.text) return;
  try {
    const regex = compilePattern(line.text, vim.options);
    const match = findMatch(vim.buf, regex, line.origin, line.type === "/", vim.options.wrapscan);
    if (match) {
      vim.incsearch = { pos: match.pos, length: match.length };
      vim.cursor = { ...match.pos };
    }
  } catch {
    // An unfinished pattern such as "(" is not an error yet.
  }
}

/** Leave command-line mode, back to where it was opened from. */
function close(vim) {
  const line = vim.cmdline;
  vim.cmdline = null;
  vim.incsearch = null;
  vim.mode = line.prevMode;
  vim.visual = line.visual;
  vim.cursor = { ...line.origin };
  vim.want = line.originWant;
  return line;
}

function cancel(vim) {
  const line = close(vim);
  vim.view.top = line.originTop;
}

function execute(vim) {
  const line = close(vim);
  const history = historyFor(vim, line);
  if (line.text && history[history.length - 1] !== line.text) history.push(line.text);
  if (history.length > HISTORY_LIMIT) history.shift();
  if (isSearch(line)) {
    completeSearch(vim, line);
    return;
  }
  vim.registers.setSpecial(":", line.text);
  vim.runEx(line.text);
}

function historyFor(vim, line) {
  return vim.history[isSearch(line) ? "/" : ":"];
}

function browseHistory(vim, line, step) {
  const history = historyFor(vim, line);
  if (history.length === 0) return;
  const index = line.historyIndex === null ? history.length : line.historyIndex;
  const next = Math.max(0, Math.min(history.length, index + step));
  line.historyIndex = next;
  line.text = next === history.length ? "" : history[next];
  previewSearch(vim);
}

const HANDLERS = {
  cancel,
  execute,
  backspace: (vim, line) => {
    if (line.text === "") {
      cancel(vim);
      return;
    }
    line.text = [...line.text].slice(0, -1).join("");
    previewSearch(vim);
  },
  clear: (vim, line) => {
    line.text = "";
    previewSearch(vim);
  },
  insertRegister: (vim, line) => {
    line.awaitingRegister = true;
  },
  historyBack: (vim, line) => browseHistory(vim, line, -1),
  historyForward: (vim, line) => browseHistory(vim, line, 1),
};
