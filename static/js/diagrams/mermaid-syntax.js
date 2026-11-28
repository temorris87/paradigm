// What can be typed in a ```mermaid block, by diagram type and by where the cursor is. Pure:
// the note window's editor asks it as text is typed (completion) and for its status line.
//
//   mermaidContext(lines, row, col) -> null outside a mermaid block, else { type, keyword,
//       position, token, name, names, indent, label }:
//     position "type"       the block's first line, the keyword being typed
//              "header"     after the keyword on its line (flowchart TD...)
//              "start"      one word typed at a line's start
//              "after-name" a line starting with a name the block uses (NW, NW->>...)
//              "after-node" after a node written with its shape and a space (A[Again] ):
//                           the token is from that space on, so a row never replaces the node
//              "inline"     a type's own place in a line (a gantt task after ":")
//              "other"      anywhere else (nothing is offered)
//     token: what was typed that a row replaces; names: the block's participants, nodes...
//   mermaidCompletion({ lines, row, col, forced }) -> null | { replace, items, head, foot }
//     items [{ label, detail, insert }]; replace: how many characters before the cursor go
//   mermaidStatus(lines, row) -> "mermaid · sequenceDiagram · 2 participants", or ""
//   mermaidBlankScope(lines, row) -> { first, last }: the block's lines, for Tab's ‹blanks›
//   mermaidBlockAt(lines, row, { fences }) -> { open, close } of the ```mermaid block holding
//       the line (with fences, its opening and closing fence lines count as in it)
//
// Rows are written with blanks, ‹like this›: the editor goes to the first one when a row goes
// in and Tab to the next, each left in the text until typed over (static/js/editor/blanks.js). The rows themselves, one table per type,
// are in mermaid-syntax-tables.js.
import { DIAGRAM_TYPES, detectDiagramType } from "./mermaid-types.js";
import { syntaxFor } from "./mermaid-syntax-tables.js";

const FOOT = "Tab or Enter takes it · ‹blanks› next with Tab · C-Space shows all for this type · Esc closes";
const OPENER = /^ {0,3}(`{3,}|~{3,})\s*([^\s`{]*)/;

const row = (insert, detail = "") => ({ insert, detail });

// ---- the block -----------------------------------------------------------------------------

/** The fenced block holding the line, if it is a mermaid one: { open, close } (close is the
 * closing fence's line, or lines.length when the block runs to the end). With fences, the
 * block's own fence lines are in it too. Pure. */
export function mermaidBlockAt(lines, row, { fences = false } = {}) {
  const from = fences ? 0 : 1; // how far past the opening fence a line must be
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    if (!fence) {
      const found = OPENER.exec(text);
      if (found) fence = { open: index, mark: found[1], mermaid: found[2].toLowerCase() === "mermaid" };
      if (index === row && !(found && fences)) return null; // text outside any block, or a fence line
      continue;
    }
    const closes = new RegExp(`^ {0,3}${fence.mark[0] === "`" ? "`" : "~"}{${fence.mark.length},}\\s*$`).test(text);
    if (closes) {
      const inside = row >= fence.open + from && (row < index || (fences && row === index));
      if (inside) return fence.mermaid ? { open: fence.open, close: index } : null;
      if (index === row) return null;
      fence = null;
    }
  }
  return fence && row >= fence.open + from && fence.mermaid ? { open: fence.open, close: lines.length } : null;
}

/** The line Mermaid reads the type from: the first after front matter, %% lines and blanks. */
function headerRow(lines, block) {
  let index = block.open + 1;
  if (/^---\s*$/.test(lines[index] ?? "")) {
    index += 1;
    while (index < block.close && !/^---\s*$/.test(lines[index])) index += 1;
    index += 1;
  }
  while (index < block.close && (/^\s*$/.test(lines[index]) || /^\s*%%/.test(lines[index]))) index += 1;
  return index < block.close ? index : null;
}

function inFrontMatter(lines, block, row) {
  if (!/^---\s*$/.test(lines[block.open + 1] ?? "")) return false;
  for (let index = block.open + 2; index < block.close; index += 1) {
    if (/^---\s*$/.test(lines[index])) return row <= index;
  }
  return true;
}

// ---- reading the cursor's place --------------------------------------------------------------

export function mermaidContext(lines, row, col) {
  const block = mermaidBlockAt(lines, row);
  if (!block || inFrontMatter(lines, block, row)) return null;
  const text = lines[row] ?? "";
  const before = text.slice(0, col);
  const indent = /^\s*/.exec(text)[0];
  if (/^\s*%%/.test(before)) return null;
  const header = headerRow(lines, block);
  const base = { indent, name: null, names: [], block, row, syntax: {} };
  // No keyword line yet, or the cursor is on it: the type is still being written.
  if (header === null || header === row) {
    const typed = /^\s*(\S*)$/.exec(before);
    const type = header === null ? null : detectDiagramType(text);
    const keyword = type && /^\s*(\S+)\s/.exec(before);
    if (keyword) {
      const after = /^\s*\S+\s+(\S*)$/.exec(before);
      const known = { ...base, type, keyword: keyword[1], syntax: syntaxFor(type, []) };
      return after ? { ...known, position: "header", token: after[1] } : { ...known, position: "other", token: "" };
    }
    return typed ? { ...base, type: null, keyword: "", position: "type", token: typed[1] } : null;
  }
  if (row < header) return null;
  const headerText = lines[header];
  const type = detectDiagramType(headerText);
  if (!type) return null;
  const keyword = /^\s*(\S+)/.exec(headerText)[1].replace(/:$/, "");
  const body = lines.slice(header + 1, block.close).filter((line, index) => header + 1 + index !== row);
  const syntax = syntaxFor(type, body);
  const names = syntax.names ? unique(syntax.names(body)) : [];
  return { ...base, type, keyword, names, syntax, ...placeIn(before, names, syntax) };
}

// Where in the line: one word at its start, a node with its shape, a line starting with a
// known name, or a type's own.
function placeIn(before, names, syntax) {
  const node = syntax.afterNode?.(before);
  if (node) return { position: "after-node", name: node.name, token: node.token };
  const word = /^\s*(\S*)$/.exec(before);
  const name = [...names].sort((a, b) => b.length - a.length).find((each) => startsWithName(before.trimStart(), each));
  if (word && !(name && word[1] === name) && !names.includes(word[1])) {
    if (!name || !syntax.after) return { position: "start", token: word[1] };
  }
  if (name && syntax.after) return { position: "after-name", name, token: before.trimStart() };
  const inline = syntax.inline?.(before);
  if (inline) return { position: "inline", token: inline.token, label: inline.label };
  return word ? { position: "start", token: word[1] } : { position: "other", token: "" };
}

function startsWithName(text, name) {
  if (!text.startsWith(name)) return false;
  const next = text[name.length];
  return next === undefined || !/[\p{L}\p{N}_]/u.test(next);
}

// ---- the list ------------------------------------------------------------------------------

/** The rows for the cursor, filtered by what was typed; null when there are none or when
 * nothing asks for them (typing opens the list only at a line start, after a name, at a
 * type's own places and after the keyword; Ctrl-Space, forced, anywhere in the block). */
export function mermaidCompletion({ lines, row, col, forced = false }) {
  const context = mermaidContext(lines, row, col);
  if (!context || context.position === "other") return null;
  if (!forced && context.position !== "header" && !context.token.trim()) return null;
  const rows = rowsFor(context);
  // A keyword typed in full ("flowchart") is done: Enter starts a new line, not flowchart-elk.
  if (!forced && context.position === "type" && rows.some((each) => each.insert === context.token)) return null;
  const items = rows
    .map((each) => ({ ...each, insert: indented(each.insert, context.indent) }))
    // Just after a name, all that can follow it; past it, what goes on the same way.
    .filter((each) => (context.position === "after-name" && context.token === context.name) || fits(each.insert, context.token))
    .filter((each) => each.insert !== context.token)
    .map((each) => ({ label: each.insert.split("\n")[0].trimStart() + (each.insert.includes("\n") ? " …" : ""), detail: each.detail, insert: each.insert }));
  if (!items.length) return null;
  return { replace: context.token.length, items: wordsFirst(items, context), head: headOf(context), foot: FOOT };
}

// At a line's start, a word being typed ("sub") puts the keywords it begins (subgraph) before
// the rows that only use it as a name (sub[text]).
function wordsFirst(items, { position, token }) {
  if (position !== "start" || !token) return items;
  const isWord = (item) => /^[\p{L}\p{N}_-]/u.test(item.insert.slice(token.length));
  return [...items.filter(isWord), ...items.filter((item) => !isWord(item))];
}

function rowsFor(context) {
  if (context.position === "type") {
    return [...DIAGRAM_TYPES.map((type) => row(type.keyword, type.name)), row("graph", "Flowchart (the old keyword)")];
  }
  const { syntax, names, token } = context;
  if (context.position === "header") return syntax.header ?? [];
  if (context.position === "after-name") return syntax.after(context.name, names);
  if (context.position === "after-node") return syntax.afterNodeRows(context.name, names);
  if (context.position === "inline") return syntax.inlineRows?.(names) ?? [];
  const starts = typeof syntax.starts === "function" ? syntax.starts(token, names) : syntax.starts ?? [];
  // A word that begins a known name also offers what can follow it.
  const named = syntax.after ? names.filter((name) => token && name.startsWith(token)).flatMap((name) => syntax.after(name, names)) : [];
  return [...starts, ...named, row("%% ‹comment›", "a comment")];
}

// What was typed matches a row when the row starts with it, spaces and case aside.
function fits(insert, token) {
  const squeeze = (text) => text.replace(/\s+/g, "").toLowerCase();
  return squeeze(insert).startsWith(squeeze(token));
}

// A row of several lines goes in under the line's indent.
function indented(insert, indent) {
  return insert.split("\n").map((line, index) => (index === 0 || !line ? line : indent + line)).join("\n");
}

function headOf(context) {
  const type = context.type;
  const title = !type ? "Mermaid" : HEADINGS[type.id] ?? `${type.name} diagram`;
  const where = {
    type: "diagram type",
    header: "after the keyword",
    start: "line start",
    "after-name": `after a ${context.syntax.nameWord ?? "name"}`,
    "after-node": `after a ${context.syntax.nameWord ?? "name"}`,
    inline: context.label ?? "in the line",
  }[context.position];
  return `${title} · ${where}`;
}

const HEADINGS = {
  flowchart: "Flowchart", "flowchart-elk": "Flowchart (ELK)", gantt: "Gantt chart", mindmap: "Mindmap",
  timeline: "Timeline", pie: "Pie chart", quadrantChart: "Quadrant chart", gitGraph: "Git graph",
  "sankey-beta": "Sankey diagram", "xychart-beta": "XY chart", kanban: "Kanban board", "treemap-beta": "Treemap",
  "radar-beta": "Radar chart", "agentflow-beta": "Agent flow", "treeView-beta": "Tree view", "wardley-beta": "Wardley map",
  "railroad-ebnf-beta": "Railroad diagram (EBNF)", "railroad-abnf-beta": "Railroad diagram (ABNF)",
  "railroad-peg-beta": "Railroad diagram (PEG)",
};

// ---- the status line -------------------------------------------------------------------------

export function mermaidStatus(lines, row) {
  const block = mermaidBlockAt(lines, row);
  if (!block) return "";
  const header = headerRow(lines, block);
  const type = header === null ? null : detectDiagramType(lines[header]);
  if (!type) return "mermaid";
  const keyword = /^\s*(\S+)/.exec(lines[header])[1].replace(/:$/, "");
  const body = lines.slice(header + 1, block.close);
  const syntax = syntaxFor(type, body);
  const word = syntax.nameWord;
  if (!syntax.names || !word) return `mermaid · ${keyword}`;
  const count = unique(syntax.names(body)).length;
  return `mermaid · ${keyword} · ${count} ${count === 1 ? word : plural(word)}`;
}

function plural(word) {
  if (/(s|sh|ch|x)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function unique(names) {
  return [...new Set(names.filter(Boolean))];
}

/** The lines Tab looks for a ‹blank› in from a line: its mermaid block's, else null. */
export function mermaidBlankScope(lines, row) {
  const block = mermaidBlockAt(lines, row);
  return block ? { first: block.open + 1, last: block.close - 1 } : null;
}
