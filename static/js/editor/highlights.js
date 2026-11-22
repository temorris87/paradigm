// Highlights in rendered blocks: text the host marks (a quote a decision was made from), drawn
// with a muted underline and a small badge after it. The editor knows nothing about what a
// highlight is; it reports a click with the highlight's data.
//
//   markHighlights(node, highlights)   wraps the first match of each highlight in node
//
// A highlight's text is raw Markdown, so it is matched against the rendered text by its
// words: its first line, Markdown marks dropped, spaces squeezed.
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
  const badge = node.ownerDocument.createElement("span");
  badge.className = "pd-highlight__badge";
  badge.dataset.highlight = String(index);
  badge.textContent = highlight.label;
  if (highlight.title) badge.title = highlight.title;
  marks[marks.length - 1].after(badge);
}
