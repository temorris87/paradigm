// Live preview, the pure part: the text cut into units that render as one piece, and which
// of them must show raw Markdown instead. No DOM.
//
// A unit is a top-level Markdown block, except that a list splits into its top-level items
// (a nested list goes with its item), so in a long list only the item being edited turns raw.
import { parseMarkdown, renderBlockHtml, renderListItemHtml } from "../markdown/index.js";

export const ID_PREFIX = "md-";

/**
 * { units: [{ start, end, html() }], byLine: unit index per line or -1, anchors: id -> line }.
 * options go to the renderer (resolveWikiLink); idPrefix must stay ID_PREFIX.
 */
export function buildUnits(text, lineCount, options = {}) {
  const doc = parseMarkdown(text);
  const units = [];
  for (const block of doc.blocks) {
    if (block.type === "list") {
      block.children.forEach((item, index) => units.push(makeUnit(item, () => renderListItemHtml(block, index, options))));
    } else {
      units.push(makeUnit(block, () => renderBlockHtml(block, options)));
    }
  }
  const byLine = new Int32Array(lineCount).fill(-1);
  units.forEach((unit, index) => {
    for (let line = unit.start; line <= Math.min(unit.end, lineCount - 1); line += 1) byLine[line] = index;
  });
  return { units, byLine, anchors: collectAnchors(doc) };
}

// The HTML is made on first use: only units near the screen are ever rendered.
function makeUnit(block, render) {
  let html = null;
  return {
    start: block.startLine,
    end: block.endLine,
    html() {
      html ??= render();
      return html;
    },
  };
}

// Where "#..." links point: headings (at any depth) and footnote definitions.
function collectAnchors(doc) {
  const anchors = new Map();
  const visit = (block) => {
    if (block.type === "heading" && !anchors.has(ID_PREFIX + block.id)) anchors.set(ID_PREFIX + block.id, block.startLine);
    for (const child of block.children) visit(child);
  };
  doc.blocks.forEach(visit);
  for (const note of doc.footnotes.order) anchors.set(`${ID_PREFIX}fn-${note.number}`, note.startLine);
  return anchors;
}

/**
 * The line ranges that must show raw: the cursor's line, a visual selection (also while a
 * ":" typed from it is open) and the match incsearch is showing.
 */
export function rawRanges(vim) {
  const ranges = [[vim.cursor.line, vim.cursor.line]];
  const visual = vim.mode === "visual" ? vim.visual : vim.cmdline?.visual;
  if (visual) {
    ranges.push([Math.min(visual.anchor.line, vim.cursor.line), Math.max(visual.anchor.line, vim.cursor.line)]);
  }
  if (vim.incsearch) ranges.push([vim.incsearch.pos.line, vim.incsearch.pos.line]);
  return ranges;
}

export function overlapsAny(unit, ranges) {
  return ranges.some(([from, to]) => unit.start <= to && unit.end >= from);
}
