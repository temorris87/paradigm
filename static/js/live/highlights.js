// Highlights in rendered text: text the host marks (a captured line, a quote a decision was
// made from), drawn with a muted underline and a small badge after it. It knows nothing about
// what a highlight is: the page reports a click with the highlight's data.
//
//   markHighlights(node, highlights)   wraps the first match of each highlight in node
//     highlight: { text, label, title, data, kind?, capture? }; kind: the tone of its badge
//     (toneOf; else capture's, else the label's); capture ("task", "decision", "question"):
//     a line captured by key (notes/capture-model.js): its chip after it ("Task → Ben · Mon")
//
// A highlight's text is raw Markdown, so it is matched against the rendered text by its
// words: its first line, Markdown marks dropped, spaces squeezed. A capture's text is the whole
// line it sits on (capture-model.js's capturesByLine picks the line, equal to its quote or
// containing it), so it matches only a whole rendered line, never part of a longer one, as the
// editor's marks do. Captures on one line share its mark, a chip each after it, in their order.
import { chip } from "../ui/chip.js";
import { toneOf } from "../ui/chip-tones.js";

export function markHighlights(node, highlights) {
  // In the highlights' order; captures with the same line join the first one's group.
  const groups = [];
  const lineGroups = new Map();
  highlights.forEach((highlight, index) => {
    const words = plainWords(highlight.text);
    if (!words) return;
    const joined = highlight.capture ? lineGroups.get(words) : null;
    if (joined) return joined.push({ highlight, index });
    const group = [{ highlight, index }];
    if (highlight.capture) lineGroups.set(words, group);
    groups.push([words, group]);
    return undefined;
  });
  for (const [words, group] of groups) markFirst(node, words, group);
}

/** "- **Who** owns [[Comms]]?" -> "Who owns Comms?" */
export function plainWords(text) {
  const line = String(text ?? "").split("\n").map((each) => each.trim()).find(Boolean) ?? "";
  return line
    .replace(/^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+|>\s*)+/, "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~=`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marks the first match of words with group[0]'s mark, and a chip per highlight after it. */
function markFirst(node, words, group) {
  const { highlight, index } = group[0];
  const texts = [];
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.parentElement?.closest("[data-highlight], .md-math, .md-mermaid")) texts.push(text);
  }
  // The rendered text with spaces squeezed, where each of its characters came from, and the
  // rendered line it is on.
  const lineOf = renderedLines(node);
  let flat = "";
  const origin = [];
  const lines = [];
  for (const text of texts) {
    let line = lineOf.get(text);
    for (let at = 0; at < text.data.length; at += 1) {
      if (text.data[at] === "\n") line += 1;
      const char = /\s/.test(text.data[at]) ? " " : text.data[at];
      if (char === " " && flat.endsWith(" ")) continue;
      flat += char;
      origin.push([text, at]);
      lines.push(line);
    }
  }
  const start = highlight.capture ? wholeLineMatch(flat, lines, words) : flat.indexOf(words);
  if (start < 0) return;
  const end = start + words.length;
  // Wrap the part of each text node the match covers, last node first so offsets hold.
  const pieces = new Map();
  for (let at = start; at < end; at += 1) {
    const [text, offset] = origin[at];
    const piece = pieces.get(text) ?? { from: offset, to: offset };
    piece.to = offset + 1;
    pieces.set(text, piece);
  }
  const marks = [];
  for (const [text, { from, to }] of [...pieces].reverse()) {
    const middle = text.splitText(from);
    middle.splitText(to - from);
    const mark = node.ownerDocument.createElement("span");
    mark.className = "pd-highlight";
    mark.dataset.highlight = String(index);
    if (highlight.title) mark.title = highlight.title;
    middle.replaceWith(mark);
    mark.append(middle);
    marks.unshift(mark);
  }
  if (highlight.capture) for (const mark of marks) mark.classList.add("pd-highlight--capture");
  marks[marks.length - 1].after(...group.map((each) => badgeOf(each.highlight, each.index)));
}

/** The badge is a status chip in the kind's tone (an answered question is still a question);
 * data-badge tells it from the marked text. */
function badgeOf(highlight, index) {
  const tone = toneOf(highlight.kind ?? highlight.capture ?? highlight.label);
  const badge = chip(highlight.label, tone, { title: highlight.title });
  badge.dataset.highlight = String(index);
  badge.dataset.badge = highlight.capture ? "capture" : "after";
  return badge;
}

const BLOCKS = new Set(["P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TD", "TH", "DT", "DD", "DIV", "UL", "OL", "TABLE", "TR"]);

/** Each text node under node -> the number of the rendered line it starts on (a block, a <br>
 * or a newline in the text starts a new one; the rest of a block after a nested block is a
 * line of its own). */
function renderedLines(node) {
  const lines = new Map();
  let line = 0;
  const visit = (parent) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        lines.set(child, line);
        line += child.data.split("\n").length - 1;
      }
      else if (child.nodeType !== Node.ELEMENT_NODE) continue;
      else if (child.tagName === "BR") line += 1;
      else if (BLOCKS.has(child.tagName)) {
        line += 1;
        visit(child);
        line += 1;
      } else visit(child);
    }
  };
  visit(node);
  return lines;
}

/** The first place words fill a rendered line on their own (spaces at its ends aside), or -1. */
function wholeLineMatch(flat, lines, words) {
  // Where each line's first and last characters that are not spaces are.
  const first = new Map();
  const last = new Map();
  for (let at = 0; at < flat.length; at += 1) {
    if (flat[at] === " ") continue;
    if (!first.has(lines[at])) first.set(lines[at], at);
    last.set(lines[at], at);
  }
  for (let start = flat.indexOf(words); start >= 0; start = flat.indexOf(words, start + 1)) {
    const line = lines[start];
    if (first.get(line) === start && last.get(line) === start + words.length - 1) return start;
  }
  return -1;
}
