// Where the note window's cursor shows on the Live page, pure: a field's raw Markdown gets a
// private-use sentinel at the cursor, and the page swaps the sentinel for the caret once the
// text is rendered. Where no caret can sit in rendered text (a fence line, a table's |---|
// row, a rule, a link's URL, maths, a diagram's source, a blank line between blocks), no
// sentinel goes in: only the band on the cursor's block shows.
//
//   placeCaret(text, line, col, mode)
//     -> { text, placed, line, shape }   text: with the sentinel when placed; line: the
//        cursor's line (0-based), for finding its block; shape: "bar" (insert, replace) or
//        "block" (every other mode)
//   CARET   the sentinel
import { scanDelimiterRun } from "../markdown/delimiters.js";
import { normalizeLabel } from "../markdown/link-syntax.js";

export const CARET = "";

const BAR_MODES = new Set(["insert", "replace"]);
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT = /^ {0,3}=+[ \t]*$/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const REFERENCE = /^ {0,3}\[[^\]]+\]:/;
const DELIMITERS = new Set(["*", "_", "~", "=", "`"]);
// Blocks whose text is never shown as text: maths and diagrams are drawn from their source.
const DRAWN_FENCES = new Set(["mermaid", "math", "latex", "tex"]);
const DEFINITION = /^ {0,3}(\[(?:[^\\[\]]|\\.)+\]):/;

export function placeCaret(text, line, col, mode) {
  const lines = String(text ?? "").split("\n");
  const at = Math.max(0, Math.min(line, lines.length - 1));
  const shape = BAR_MODES.has(mode) ? "bar" : "block";
  const source = lines[at] ?? "";
  const placed = lineWithCaret(lines, at, Math.max(0, Math.min(col, source.length)));
  if (placed === null) return { text: lines.join("\n"), placed: false, line: at, shape };
  lines[at] = placed;
  return { text: lines.join("\n"), placed: true, line: at, shape };
}

/** Line `at` with the sentinel in it, or null for none. */
function lineWithCaret(lines, at, col) {
  const line = lines[at];
  const spot = caretColumn(lines, at, col);
  if (spot === null) return null;
  if (typeof spot === "string") return spot;
  return line.slice(0, spot) + CARET + line.slice(spot);
}

/** The column the sentinel goes in on line `at`, null for none, or the whole line when the
 * sentinel needs the line rewritten (a bare [[wiki link]]). */
function caretColumn(lines, at, col) {
  const block = blockState(lines, at);
  if (block === "fence-line" || block === "drawn") return null;
  const line = lines[at];
  if (block === "code") return col;
  // A sentinel would make a blank line text: the blocks around it would merge or change.
  if (!line.trim()) return null;
  if (RULE.test(line) || SETEXT.test(line) || REFERENCE.test(line)) return null;
  if (line.includes("|") && line.includes("-") && TABLE_DELIMITER.test(line)) return null;
  let spot = Math.max(col, markerEnd(line));
  if (isTableRow(line)) spot = insideTableRow(line, spot);
  const wiki = inBareWikiLink(line, spot);
  if (wiki) return wiki;
  const reference = inReferenceLink(line, spot, definedLabels(lines));
  if (reference) return reference.line;
  if (insideUnshown(line, spot)) return null;
  // Between a backslash and what it escapes, or inside a run of ** or ~~: before them.
  if (line[spot - 1] === "\\") spot -= 1;
  while (spot > 0 && DELIMITERS.has(line[spot]) && line[spot - 1] === line[spot]) spot -= 1;
  // Between the "!" and "[" of an image: before both, or the image becomes a link.
  if (line[spot - 1] === "!" && line[spot] === "[") spot -= 1;
  return besideUnderscores(line, spot);
}

/**
 * The sentinel is neither space nor punctuation, so beside a "_" run on its open side it
 * makes the run flank both ways, and "_" emphasis may then neither open nor close. Just
 * before an opener the sentinel goes after the run; just after a closer, before it. The
 * markers aren't shown, so the caret shows at the same place.
 */
function besideUnderscores(line, spot) {
  if (line[spot] === "_") {
    const run = scanDelimiterRun(line, spot);
    if (run.canOpen && !run.canClose) return spot + run.count;
  }
  if (line[spot - 1] === "_") {
    let from = spot - 1;
    while (from > 0 && line[from - 1] === "_") from -= 1;
    const run = scanDelimiterRun(line, from);
    if (run.canClose && !run.canOpen) return from;
  }
  return spot;
}

/** Whether line `at` is in a code fence ("code"), opens or closes one ("fence-line"), is in
 * a diagram, maths fence or $$ block ("drawn"), or is none of these (null). */
function blockState(lines, at) {
  let fence = null;
  let math = false;
  for (let index = 0; index <= at; index += 1) {
    const line = lines[index];
    if (fence) {
      const close = FENCE.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length && !close[2]) {
        if (index === at) return "fence-line";
        fence = null;
        continue;
      }
      if (index === at) return fence.drawn ? "drawn" : "code";
      continue;
    }
    if (math) {
      if (index === at) return "drawn";
      if (/\$\$\s*$/.test(line)) math = false;
      continue;
    }
    const open = FENCE.exec(line);
    if (open && !(open[1][0] === "`" && line.slice(line.indexOf(open[1]) + open[1].length).includes("`"))) {
      if (index === at) return "fence-line";
      fence = { char: open[1][0], length: open[1].length, drawn: DRAWN_FENCES.has(open[2].toLowerCase()) };
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("$$")) {
      if (index === at) return "drawn";
      const closed = trimmed.length > 2 && /\$\$\s*$/.test(trimmed.slice(2));
      if (!closed) math = true;
    }
  }
  return null;
}

/** Where the text after a line's markers starts: indent, quote marks, a heading's #s, a
 * list marker and its task box. */
function markerEnd(line) {
  const match = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#{1,6}(?=[ \t]|$)[ \t]*|(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)[ \t]*(?:\[[ xX]\](?=[ \t]|$)[ \t]*)?)?/.exec(line);
  return match ? match[0].length : 0;
}

/**
 * A [[Target]] with no label shows its target as its text, but the sentinel can't go in the
 * target, which finds the note. So the link gets the target as its label too, with the
 * sentinel in the label: [[Target|Tar<caret>get]]. Returns that line, or null. A target with a
 * #heading shows as "Target > heading", which has no column to map to: band only.
 */
function inBareWikiLink(line, spot) {
  for (const match of line.matchAll(/\[\[([^[\]|\n#]+)\]\]/g)) {
    const from = match.index;
    const to = from + match[0].length;
    if (spot <= from || spot >= to) continue;
    const target = match[1];
    const inLabel = Math.max(0, Math.min(spot - from - 2, target.length));
    const label = target.slice(0, inLabel) + CARET + target.slice(inLabel);
    return `${line.slice(0, from)}[[${target}|${label}]]${line.slice(to)}`;
  }
  return null;
}

/** The normalised labels of the text's [label]: url definitions. */
function definedLabels(lines) {
  const labels = new Set();
  for (const line of lines) {
    const match = DEFINITION.exec(line);
    if (match && !match[1].startsWith("[^")) labels.add(normalizeLabel(match[1]));
  }
  return labels;
}

/**
 * A reference link's label is looked up among the definitions, so a sentinel in it would
 * lose the link. In [text][ref] the text is shown and takes the sentinel, the [ref] shows
 * nothing: band only. A shortcut [text] or collapsed [text][] shows its label as its text,
 * so it becomes [te<caret>xt][text], as a bare wiki link gets a label. Returns { line }:
 * that line, or null for the band only; or null when the spot is in no reference link.
 */
function inReferenceLink(line, spot, labels) {
  if (!labels.size) return null;
  for (const match of line.matchAll(/\[((?:[^\\[\]]|\\.)+)\](?:\[((?:[^\\[\]]|\\.)*)\])?/g)) {
    const from = match.index;
    const to = from + match[0].length;
    const textEnd = from + 1 + match[1].length; // the "]" after the text
    if (spot <= from || spot >= to || line[from - 1] === "[" || match[1].startsWith("^")) continue;
    const ref = match[2];
    if (ref === undefined && /[(:[]/.test(line[to] ?? "")) continue;
    const key = ref ? `[${ref}]` : `[${match[1]}]`;
    if (!labels.has(normalizeLabel(key))) continue;
    if (spot > textEnd) return { line: null };
    if (ref) return null;
    const inText = spot - from - 1;
    const text = match[1].slice(0, inText) + CARET + match[1].slice(inText);
    return { line: `${line.slice(0, from)}[${text}][${match[1]}]${line.slice(to)}` };
  }
  return null;
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.length > 1 && trimmed.startsWith("|") && trimmed.endsWith("|");
}

// A sentinel before a row's first | or after its last one would add a cell to the row.
function insideTableRow(line, spot) {
  const first = line.indexOf("|");
  const last = line.lastIndexOf("|");
  if (spot <= first) return first + 1;
  if (spot > last) return last;
  return spot;
}

/** Whether a column is in a part of the line that renders as no text: a link's or image's
 * URL, a [[wiki link]]'s target, an autolink, a bare URL, maths, or inside an @mention. */
function insideUnshown(line, spot) {
  return unshownRanges(line).some(([from, to]) => spot > from && spot < to);
}

function unshownRanges(line) {
  const ranges = [];
  const add = (regex) => {
    for (const match of line.matchAll(regex)) ranges.push([match.index, match.index + match[0].length]);
  };
  // "](url)": a sentinel from between the "]" and the "(" to before the ")" is in the URL.
  add(/\]\([^)]*\)/g);
  // [^label]: a footnote reference's label is looked up, never shown as typed.
  add(/\[\^[^\]\s]+\]/g);
  // [[target]] or [[target|label]]: the target is the link's; the label is shown.
  for (const match of line.matchAll(/\[\[([^\]]*)\]\]/g)) {
    const end = match.index + match[0].length;
    const bar = match[1].indexOf("|");
    if (bar < 0) {
      ranges.push([match.index, end]);
    } else {
      ranges.push([match.index, match.index + 3 + bar], [end - 2, end]);
    }
  }
  add(/<[a-z][a-z0-9+.-]*:[^\s<>]*>/gi);
  add(/\b(?:https?:\/\/|www\.)[^\s<]+/gi);
  add(/(?<![\\$])\$(?!\s)(?:\\.|[^$\\])*?(?<!\s)\$(?![0-9])/g);
  add(/\$\$(?:\\.|[^$\\])+?\$\$/g);
  add(/(?<![\p{L}\p{N}_@./:+-])@\p{L}[\p{L}\p{N}_'-]*/gu);
  return ranges;
}
