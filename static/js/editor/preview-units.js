// Live preview, the pure part: the text cut into units that render as one piece, and which
// of them must show raw Markdown instead. No DOM.
//
// A unit is a top-level Markdown block, except that a list splits into its items at every
// depth: an item is its own lines, drawn at its indent, and each sub-bullet is a unit of its
// own. An item with other blocks after its sub-list stays whole (with its sub-lists), so
// what follows keeps the item's indent.
import { parseMarkdown, renderBlockHtml, renderListItemHtml, renderNestedItemHtml } from "../markdown/index.js";

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
      listUnits(block, [], options, units);
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

function listUnits(list, above, options, units) {
  list.children.forEach((item, index) => {
    const path = [...above, { list, index }];
    const first = item.children.findIndex((child) => child.type === "list");
    const splits = first >= 0 && item.children.slice(first).every((child) => child.type === "list");
    if (!splits) {
      const whole = path.length === 1 ? () => renderListItemHtml(list, index, options) : () => renderNestedItemWhole(path, options);
      units.push(makeUnit(item, whole));
      return;
    }
    const own = item.children.slice(0, first);
    const end = own.length ? Math.max(...own.map((child) => child.endLine)) : item.startLine;
    units.push(makeUnit({ startLine: item.startLine, endLine: end }, () => renderNestedItemHtml(path, options)));
    for (const child of item.children.slice(first)) listUnits(child, path, options, units);
  });
}

// A nested item kept whole: its sub-lists go with it, at its depth.
function renderNestedItemWhole(path, options) {
  return renderNestedItemHtml(path, { ...options, keepSubLists: true });
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
 * The line ranges that must show raw: the cursor's line in insert or replace mode, a visual
 * selection (also while a ":" typed from it is open) and the match incsearch is showing. In
 * normal mode the cursor's block stays rendered, with a marker beside it.
 */
export function rawRanges(vim) {
  const ranges = vim.isInsertLike() ? [[vim.cursor.line, vim.cursor.line]] : [];
  if (vim.mode === "visual" && vim.visual) ranges.push(lineSpan(vim.visual.anchor, vim.cursor));
  // ":" from visual mode leaves it, but the command still works on those lines.
  const fromVisual = vim.mode === "cmdline" && vim.cmdline.text.startsWith("'<,'>") && vim.lastVisual;
  if (fromVisual) ranges.push(lineSpan(vim.lastVisual.anchor, vim.lastVisual.cursor));
  if (vim.incsearch) ranges.push([vim.incsearch.pos.line, vim.incsearch.pos.line]);
  return ranges;
}

const lineSpan = (a, b) => [Math.min(a.line, b.line), Math.max(a.line, b.line)];

export function overlapsAny(unit, ranges) {
  return ranges.some(([from, to]) => unit.start <= to && unit.end >= from);
}
