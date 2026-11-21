// The Markdown renderer. Pure: Markdown text in, an HTML string out, no DOM.
//
//   parseMarkdown(source)       -> doc: { blocks, footnotes, references }
//   renderMarkdown(source, opt) -> HTML for the whole note, footnotes at the end
//   renderBlocks(doc, opt)      -> { blocks: [{ startLine, endLine, html }], footnotes: html }
//                                  one entry per top-level block, for live preview
//
// Options: idPrefix ("md-") goes before every id, so two notes on one page never clash;
// breaks (true) renders single newlines as <br>, like Obsidian; resolveWikiLink(link) returns
// { href, exists } or null for [[wiki links]] ({ target, heading, alias }).
import { parseBlocks } from "./blocks.js";
import { parseInline } from "./inline.js";
import { renderBlock, renderFootnotes, plainText } from "./render.js";
import { makeSlugger } from "./slug.js";

const DEFAULTS = { idPrefix: "md-", breaks: true, resolveWikiLink: null };

export function parseMarkdown(source) {
  const { document, references, footnotes } = parseBlocks(source);
  const context = { references, footnotes, slug: makeSlugger() };
  for (const block of document.children) prepare(block, context);
  return { blocks: document.children, footnotes, references };
}

export function renderMarkdown(source, options = {}) {
  const { blocks, footnotes } = renderBlocks(parseMarkdown(source), options);
  const html = blocks.map((block) => block.html).filter(Boolean);
  if (footnotes) html.push(footnotes);
  return html.length ? `${html.join("\n")}\n` : "";
}

export function renderBlocks(doc, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  return {
    blocks: doc.blocks.map((block) => ({
      startLine: block.startLine,
      endLine: block.endLine,
      html: renderBlock(block, settings),
    })),
    footnotes: renderFootnotes(doc.footnotes, settings),
  };
}

// Inline parsing and heading ids, in document order (footnote numbers depend on it), and
// dropping the parser's bookkeeping so the tree is plain data.
function prepare(block, context) {
  delete block.parent;
  delete block.open;
  delete block.lastLineBlank;
  delete block.depth;
  const inline = (text) => parseInline(text, context);
  switch (block.type) {
    case "paragraph":
      block.inlines = inline(block.text);
      break;
    case "heading":
      block.inlines = inline(block.text);
      block.id = context.slug(plainText(block.inlines));
      break;
    case "callout":
      block.titleInlines = inline(block.title);
      break;
    case "table":
      block.headInlines = block.head.map(inline);
      block.rowInlines = block.rows.map((row) => row.map(inline));
      break;
    default:
      break;
  }
  for (const child of block.children) prepare(child, context);
}
