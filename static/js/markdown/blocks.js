// The block parser: the CommonMark two-phase algorithm's first phase. Lines are read one at
// a time against a stack of open blocks: first the open containers each claim their marker,
// then new block starts are tried, then the rest of the line goes to the innermost block.
// Every block records the 0-based source lines it covers (startLine..endLine), which live
// preview uses to map blocks back to the text.
import { BLOCK_STARTS, CONTAINER, LEAF, NONE } from "./block-starts.js";
import { BLOCK_TYPES, LINE_DONE, NOT_MATCHED } from "./block-types.js";
import { FootnoteRegistry } from "./footnotes.js";
import { LineCursor } from "./lines.js";
import { fitRow, splitRow } from "./tables.js";

export function makeBlock(type, line) {
  return { type, children: [], parent: null, open: true, depth: 0, startLine: line, endLine: line, lastLineBlank: false };
}

export function parseBlocks(source) {
  const parser = new BlockParser();
  const lines = String(source).replace(/\r\n?/g, "\n").replace(/\0/g, "�").split("\n");
  // A final newline ends the last line; it does not start another one.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  lines.forEach((text, number) => parser.incorporateLine(text, number));
  while (parser.tip) parser.finalize(parser.tip);
  return { document: parser.document, references: parser.references, footnotes: parser.footnotes };
}

class BlockParser {
  constructor() {
    this.document = makeBlock("document", 0);
    this.tip = this.document;
    this.references = new Map();
    this.footnotes = new FootnoteRegistry();
  }

  incorporateLine(text, number) {
    const line = (this.line = new LineCursor(text, number));
    this.oldTip = this.tip;
    let container = this.document;

    // 1. Each open container claims its part of the line ("> ", list indentation...).
    for (let child = lastOpenChild(container); child; child = lastOpenChild(container)) {
      container = child;
      line.findNextNonspace();
      const result = BLOCK_TYPES[container.type].proceed(this, container);
      if (result === LINE_DONE) return;
      if (result === NOT_MATCHED) {
        container = container.parent;
        break;
      }
    }
    this.allClosed = container === this.oldTip;
    this.lastMatchedContainer = container;

    // 2. New blocks starting on what is left.
    let matchedLeaf = !opensToStarts(container);
    while (!matchedLeaf) {
      line.findNextNonspace();
      let result = NONE;
      for (const start of BLOCK_STARTS) {
        result = start(this, container);
        if (result !== NONE) break;
      }
      if (result === NONE) {
        line.advanceNextNonspace();
        break;
      }
      container = this.tip;
      matchedLeaf = result === LEAF;
    }

    // 3. The rest of the line is text for the innermost block.
    if (!this.allClosed && !line.blank && this.tip.type === "paragraph") {
      this.addLine(); // a lazy continuation line
    } else {
      this.closeUnmatchedBlocks();
      this.recordBlankLine(container);
      if (BLOCK_TYPES[container.type].acceptsLines) {
        this.addLine();
      } else if (line.offset < text.length && !line.blank) {
        this.addChild("paragraph");
        line.advanceNextNonspace();
        this.addLine();
      }
    }
    if (!line.blank || keepsBlankLines(this.tip)) this.touch(this.tip);
  }

  // Loose and tight lists depend on where the blank lines fall.
  recordBlankLine(container) {
    const line = this.line;
    const last = container.children[container.children.length - 1];
    if (line.blank && last) last.lastLineBlank = true;
    const type = container.type;
    const blank =
      line.blank &&
      !(
        type === "quote" ||
        type === "callout" ||
        keepsBlankLines(container) ||
        (type === "item" && container.children.length === 0 && container.startLine === line.number)
      );
    for (let block = container; block; block = block.parent) block.lastLineBlank = blank;
  }

  addLine() {
    const text = this.line.remainder();
    const tip = this.tip;
    if (tip.type === "table") {
      if (text.trim()) tip.rows.push(fitRow(splitRow(text), tip.align.length));
    } else {
      tip.lines.push(text);
    }
  }

  addChild(type, startLine = this.line.number) {
    while (!BLOCK_TYPES[this.tip.type].canContain(type)) this.finalize(this.tip);
    const block = makeBlock(type, startLine);
    if (type === "paragraph" || type === "code" || type === "math") block.lines = [];
    block.parent = this.tip;
    block.depth = this.tip.depth + 1;
    this.tip.children.push(block);
    this.tip = block;
    return block;
  }

  /** Put a new block of `type` in place of `block` (a paragraph becoming a heading). */
  replace(block, type) {
    const fresh = makeBlock(type, block.startLine);
    fresh.parent = block.parent;
    fresh.depth = block.depth;
    const siblings = block.parent.children;
    siblings[siblings.indexOf(block)] = fresh;
    this.tip = fresh;
    return fresh;
  }

  unlink(block) {
    const siblings = block.parent.children;
    const index = siblings.indexOf(block);
    if (index !== -1) siblings.splice(index, 1);
  }

  closeUnmatchedBlocks() {
    if (this.allClosed) return;
    while (this.oldTip !== this.lastMatchedContainer) {
      const parent = this.oldTip.parent;
      this.finalize(this.oldTip);
      this.oldTip = parent;
    }
    this.allClosed = true;
  }

  finalize(block) {
    block.open = false;
    this.tip = block.parent;
    BLOCK_TYPES[block.type].finish(this, block);
  }

  /** The current line belongs to `block` and everything around it. */
  touch(block) {
    for (let at = block; at; at = at.parent) at.endLine = Math.max(at.endLine, this.line.number);
  }
}

// Blank lines inside a fence belong to it: they neither end it nor loosen a list.
function keepsBlankLines(block) {
  return (block.type === "code" && block.fenced) || block.type === "math";
}

function lastOpenChild(block) {
  const last = block.children[block.children.length - 1];
  return last && last.open ? last : null;
}

// Paragraphs and tables can be interrupted by new blocks; other leaves (code) take the line.
function opensToStarts(container) {
  const type = container.type;
  return type === "paragraph" || type === "table" || !BLOCK_TYPES[type].acceptsLines;
}
