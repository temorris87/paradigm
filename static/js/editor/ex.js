// Ex commands typed after ":". The editor knows nothing about files: :w and :q only send
// "save" and "quit" events, and whoever hosts the editor decides what they mean. The host
// can add its own commands too (vim.exCommands): they send an "ex" event.
import { EditorError } from "./errors.js";
import { OPERATORS } from "./operators.js";
import { clamp, firstNonBlankCol, pos } from "./position.js";
import { compilePattern } from "./search.js";
import { setOptions } from "./options.js";
import { alignColumn, copyTable, insertTable, sortTable } from "./table-edit.js";

// name, the shortest abbreviation Vim accepts, and the handler.
const COMMANDS = [
  ["write", 1, (vim, cmd) => vim.emit("save", { force: cmd.bang })],
  ["wq", 2, (vim) => { vim.emit("save"); vim.emit("quit"); }],
  ["xit", 1, (vim) => { vim.emit("save"); vim.emit("quit"); }],
  ["quit", 1, (vim, cmd) => vim.emit("quit", { force: cmd.bang })],
  ["substitute", 1, substitute],
  ["set", 2, (vim, cmd) => setOptions(vim, cmd.arg)],
  ["nohlsearch", 3, (vim) => { vim.search.highlight = false; }],
  ["delete", 1, (vim, cmd) => onLines(vim, cmd, "delete")],
  ["yank", 1, (vim, cmd) => onLines(vim, cmd, "yank")],
  ["undo", 1, (vim) => vim.feedKeysNow(["u"])],
  ["redo", 3, (vim) => vim.feedKeysNow(["<C-r>"])],
  // Markdown tables (table-edit.js); none of these names is a Vim command.
  ["table", 5, (vim, cmd) => insertTable(vim, ...cmd.arg.trim().split(/\s+/).filter(Boolean).map(Number))],
  ["tsort", 5, (vim, cmd) => sortTable(vim, cmd.arg, cmd.bang)],
  ["talign", 6, (vim, cmd) => alignColumn(vim, cmd.arg)],
  ["tcopy", 5, (vim) => copyTable(vim)],
];

export function runEx(vim, text) {
  const source = text.trim();
  if (!source) return;
  const { range, rest } = parseRange(vim, source);
  const match = /^([a-zA-Z]+)(!?)\s*(.*)$/s.exec(rest);
  if (!match) {
    if (rest === "" && range) {
      goToLine(vim, range.end);
      return;
    }
    throw new EditorError(`E492: Not an editor command: ${source}`);
  }
  const [, name, bang, arg] = match;
  const command = COMMANDS.find(([full, min]) => matches(name, full, min));
  if (!command) {
    if (!range && runHostCommand(vim, name, bang === "!", arg.trim())) return;
    throw new EditorError(`E492: Not an editor command: ${source}`);
  }
  command[2](vim, { range, bang: bang === "!", arg: arg.trim() === "" ? "" : arg, name: command[0] });
}

// Built-in commands win, so a host can never change what a Vim command does.
function runHostCommand(vim, name, bang, arg) {
  for (const [full, min] of vim.exCommands) {
    if (matches(name, full, min)) {
      vim.emit("ex", { name: full, bang, arg });
      return true;
    }
  }
  return false;
}

function matches(name, full, min) {
  return name.length >= min && full.startsWith(name);
}

function goToLine(vim, line) {
  vim.marks.set("'", vim.cursor);
  vim.setCursor(pos(line, firstNonBlankCol(vim.buf.line(line))));
}

/** Ranges: %  .  $  N  'm  with +N / -N offsets, and "a,b". */
export function parseRange(vim, source) {
  if (source.startsWith("%")) return { range: { start: 0, end: vim.buf.lastLine }, rest: source.slice(1).trim() };
  let rest = source;
  const first = parseAddress(vim, rest);
  if (!first) return { range: null, rest };
  rest = first.rest;
  let second = first;
  if (rest.startsWith(",") || rest.startsWith(";")) {
    second = parseAddress(vim, rest.slice(1)) ?? { line: vim.cursor.line, rest: rest.slice(1) };
    rest = second.rest;
  }
  const last = vim.buf.lastLine;
  if (first.line < 0 || second.line < 0 || first.line > last || second.line > last) {
    throw new EditorError("E16: Invalid range");
  }
  const [start, end] = first.line <= second.line ? [first.line, second.line] : [second.line, first.line];
  return { range: { start, end }, rest: rest.trim() };
}

function parseAddress(vim, source) {
  let rest = source.trimStart();
  let line = null;
  let match;
  if (rest.startsWith(".")) {
    line = vim.cursor.line;
    rest = rest.slice(1);
  } else if (rest.startsWith("$")) {
    line = vim.buf.lastLine;
    rest = rest.slice(1);
  } else if ((match = /^\d+/.exec(rest))) {
    line = Math.max(0, Number(match[0]) - 1);
    rest = rest.slice(match[0].length);
  } else if ((match = /^'([a-z<>'])/.exec(rest))) {
    const mark = vim.marks.get(match[1]);
    if (!mark) throw new EditorError("E20: Mark not set");
    line = mark.line;
    rest = rest.slice(2);
  }
  // Offsets: "+3", "-", ".+1"; a bare offset counts from the cursor line.
  while ((match = /^\s*([+-])(\d*)/.exec(rest)) && match[0].trim()) {
    if (line === null) line = vim.cursor.line;
    const amount = match[2] === "" ? 1 : Number(match[2]);
    line += match[1] === "+" ? amount : -amount;
    rest = rest.slice(match[0].length);
  }
  return line === null ? null : { line, rest };
}

function currentLines(vim, cmd) {
  return cmd.range ?? { start: vim.cursor.line, end: vim.cursor.line };
}

// :d [x] [count] and :y [x] [count]
function onLines(vim, cmd, operator) {
  const { start, end } = currentLines(vim, cmd);
  const match = /^\s*([a-zA-Z0-9"_+*-])?\s*(\d+)?\s*$/.exec(cmd.arg);
  if (!match) throw new EditorError(`E488: Trailing characters: ${cmd.arg}`);
  const register = match[1] ?? null;
  const last = match[2] ? clamp(end + Number(match[2]) - 1, 0, vim.buf.lastLine) : end;
  const first = match[2] ? end : start;
  const cursor = vim.cursor;
  OPERATORS[operator](vim, { kind: "line", first, last }, { register });
  if (operator === "yank") vim.setCursor(cursor); // :y leaves the cursor alone
}

/** :s/pattern/replacement/flags. An empty pattern reuses the last search. */
function substitute(vim, cmd) {
  const parts = splitSubstitute(cmd.arg);
  const pattern = parts.pattern || vim.search.pattern;
  if (!pattern) throw new EditorError("E35: No previous regular expression");
  const flags = parts.flags;
  if (/[^gieIn&\s]/.test(flags)) throw new EditorError(`E488: Trailing characters: ${flags}`);
  if (flags.includes("c")) throw new EditorError("E488: The c flag is not supported");
  const caseRule = flags.includes("I") ? "match" : flags.includes("i") ? "ignore" : null;
  const regex = compilePattern(pattern, vim.options, caseRule);
  vim.setSearch(pattern, vim.search.forward ?? true);
  const replace = replacer(parts.replacement);
  const { start, end } = currentLines(vim, cmd);
  let count = 0;
  let changedLines = 0;
  let lastChanged = null;
  // Bottom up, so line numbers above stay valid when a replacement adds lines.
  for (let line = end; line >= start; line -= 1) {
    const text = vim.buf.line(line);
    let hits = 0;
    regex.lastIndex = 0;
    const global = flags.includes("g");
    const result = text.replace(global ? regex : new RegExp(regex.source, regex.flags.replace("g", "")), (...args) => {
      hits += 1;
      return replace(args);
    });
    if (hits === 0) continue;
    count += hits;
    changedLines += 1;
    if (lastChanged === null) lastChanged = line + result.split("\n").length - 1;
    if (result !== text) vim.edit(pos(line, 0), pos(line, text.length), result);
  }
  if (count === 0) {
    if (flags.includes("e")) return;
    throw new EditorError(`E486: Pattern not found: ${pattern}`);
  }
  vim.marks.set("'", vim.cursor);
  vim.setCursor(pos(lastChanged, firstNonBlankCol(vim.buf.line(lastChanged))));
  if (changedLines > 2 || count > 2) {
    vim.say(`${count} substitution${count === 1 ? "" : "s"} on ${changedLines} line${changedLines === 1 ? "" : "s"}`);
  }
}

function splitSubstitute(arg) {
  const delimiter = arg[0];
  if (!delimiter) return { pattern: "", replacement: "~", flags: "" };
  if (/[a-zA-Z0-9\\"| ]/.test(delimiter)) throw new EditorError("E146: Regular expressions can't be delimited by letters");
  const fields = [""];
  for (let index = 1; index < arg.length; index += 1) {
    const char = arg[index];
    if (char === "\\" && arg[index + 1] === delimiter) {
      fields[fields.length - 1] += delimiter;
      index += 1;
    } else if (char === "\\" && index + 1 < arg.length) {
      fields[fields.length - 1] += char + arg[index + 1];
      index += 1;
    } else if (char === delimiter && fields.length < 3) {
      fields.push("");
    } else {
      fields[fields.length - 1] += char;
    }
  }
  return { pattern: fields[0], replacement: fields[1] ?? "", flags: (fields[2] ?? "").trim() };
}

// Vim's replacement syntax: & and \0 the whole match, \1-\9 groups, \r or \n a line break,
// \t a tab, \& a literal &, \\ a backslash.
function replacer(template) {
  return (args) => {
    const groups = args.slice(0, args.findIndex((value) => typeof value === "number"));
    let out = "";
    for (let index = 0; index < template.length; index += 1) {
      const char = template[index];
      if (char === "&") {
        out += groups[0];
      } else if (char === "\\" && index + 1 < template.length) {
        const next = template[++index];
        if (/[0-9]/.test(next)) out += groups[Number(next)] ?? "";
        else if (next === "r" || next === "n") out += "\n";
        else if (next === "t") out += "\t";
        else out += next;
      } else {
        out += char;
      }
    }
    return out;
  };
}

