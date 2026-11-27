// Highlights in rendered text: text the host marks (a quote a decision was made from), drawn
// with a muted underline and a small badge after it. It knows nothing about what a
// highlight is: the page reports a click with the highlight's data.
//
//   markHighlights(node, highlights)   wraps the first match of each highlight in node
//     highlight: { text, label, title, data, kind?, capture?, meta? }; kind: the tone of its
//     badge (toneOf; else capture's, else the label's); capture ("task", "decision",
//     "question"): the badge goes before the text, in its colour, in place of the "T:" the
//     line starts with; meta: words after it ("→ Priya Shah · due Wed")
//
// A highlight's text is raw Markdown, so it is matched against the rendered text by its
// words: its first line, Markdown marks dropped, spaces squeezed.
import { chip } from "../ui/chip.js";
import { toneOf } from "../ui/chip-tones.js";

export function markHighlights(node, highlights) {
  highlights.forEach((highlight, index) => {
    const words = plainWords(highlight.text);
    if (words) markFirst(node, words, index, highlight);
  });
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

function markFirst(node, words, index, highlight) {
  const texts = [];
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.parentElement?.closest("[data-highlight], .md-math, .md-mermaid")) texts.push(text);
  }
  // The rendered text with spaces squeezed, and where each of its characters came from.
  let flat = "";
  const origin = [];
  for (const text of texts) {
    for (let at = 0; at < text.data.length; at += 1) {
      const char = /\s/.test(text.data[at]) ? " " : text.data[at];
      if (char === " " && flat.endsWith(" ")) continue;
      flat += char;
      origin.push([text, at]);
    }
  }
  const start = flat.indexOf(words);
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
  // The badge is a status chip in the kind's tone (an answered question is still a question);
  // data-badge tells it from the marked text.
  const tone = toneOf(highlight.kind ?? highlight.capture ?? highlight.label);
  const badge = chip(highlight.label, tone, { title: highlight.title });
  badge.dataset.highlight = String(index);
  badge.dataset.badge = highlight.capture ? "capture" : "after";
  if (!highlight.capture) {
    marks[marks.length - 1].after(badge);
    return;
  }
  for (const mark of marks) mark.classList.add("pd-highlight--capture");
  // The "T: " before the text: the badge says it now. The text may start inside a link (a
  // mention), so look for the text just before it in reading order.
  const before = textBefore(node, marks[0]);
  if (before) before.data = before.data.replace(/(^|\s)[TDQ]:\s*$/, "$1");
  const first = marks[0].parentElement?.closest("a") && marks[0].parentElement.closest("a").contains(marks[0])
    && marks[0].parentElement.closest("a").textContent.startsWith(marks[0].textContent) ? marks[0].parentElement.closest("a") : marks[0];
  first.before(badge);
  if (highlight.meta) {
    const meta = node.ownerDocument.createElement("span");
    meta.className = "pd-highlight__meta";
    meta.textContent = highlight.meta;
    marks[marks.length - 1].after(meta);
  }
}

/** The text node that comes just before an element, inside node, or null. */
function textBefore(node, element) {
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let previous = null;
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (element.contains(text)) return previous;
    // Wrapping a whole text node leaves an empty one where it was.
    if (text.data) previous = text;
  }
  return null;
}
