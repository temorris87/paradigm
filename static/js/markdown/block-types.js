// How each kind of block behaves while the block parser runs:
//   proceed(parser, block) -> MATCHED, NOT_MATCHED or LINE_DONE: does this line continue it?
//   finish(parser, block)  -> tidy up once the block closes
//   canContain(type), acceptsLines
import { isSpaceOrTab } from "./lines.js";
import { isTight, markTask } from "./lists.js";
import { markCallout } from "./callouts.js";
import { unescapeBackslashes } from "./link-syntax.js";
import { takeReferences } from "./references.js";

export const MATCHED = 0;
export const NOT_MATCHED = 1;
export const LINE_DONE = 2;

const CLOSING_FENCE = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;

const notItem = (type) => type !== "item";
const never = () => false;
const nothing = () => {};

/** Item-like containers continue on blank lines and on lines indented past the marker. */
function proceedIndented(parser, block, width) {
  const line = parser.line;
  if (line.blank) {
    if (block.children.length === 0) return NOT_MATCHED; // at most one blank line to start
    line.advanceNextNonspace();
  } else if (line.indent >= width) {
    line.advanceOffset(width, true);
  } else {
    return NOT_MATCHED;
  }
  return MATCHED;
}

export const BLOCK_TYPES = {
  document: { proceed: () => MATCHED, finish: nothing, canContain: notItem, acceptsLines: false },

  quote: {
    proceed(parser) {
      const line = parser.line;
      if (line.indented || line.peek() !== ">") return NOT_MATCHED;
      line.advanceNextNonspace();
      line.advanceOffset(1);
      if (isSpaceOrTab(line.peek(line.offset))) line.advanceOffset(1, true);
      return MATCHED;
    },
    finish: (parser, block) => markCallout(block),
    canContain: notItem,
    acceptsLines: false,
  },

  list: {
    proceed: () => MATCHED,
    finish(parser, block) {
      block.tight = isTight(block);
    },
    canContain: (type) => type === "item",
    acceptsLines: false,
  },

  item: {
    proceed: (parser, block) => proceedIndented(parser, block, block.markerOffset + block.padding),
    finish: (parser, block) => markTask(block),
    canContain: notItem,
    acceptsLines: false,
  },

  footnote: {
    proceed: (parser, block) => proceedIndented(parser, block, 4),
    finish: (parser, block) => parser.footnotes.define(block),
    canContain: notItem,
    acceptsLines: false,
  },

  heading: { proceed: () => NOT_MATCHED, finish: nothing, canContain: never, acceptsLines: false },

  hr: { proceed: () => NOT_MATCHED, finish: nothing, canContain: never, acceptsLines: false },

  code: {
    proceed(parser, block) {
      const line = parser.line;
      if (block.fenced) {
        const close = !line.indented && CLOSING_FENCE.exec(line.rest());
        if (close && close[0][0] === block.fenceChar && close[0].length >= block.fenceLength) {
          parser.touch(block);
          parser.finalize(block);
          return LINE_DONE;
        }
        // Content loses as much indentation as the opening fence had.
        for (let i = block.fenceOffset; i > 0 && isSpaceOrTab(line.peek(line.offset)); i -= 1) {
          line.advanceOffset(1, true);
        }
      } else if (line.indent >= 4) {
        line.advanceOffset(4, true);
      } else if (line.blank) {
        line.advanceNextNonspace();
      } else {
        return NOT_MATCHED;
      }
      return MATCHED;
    },
    finish(parser, block) {
      if (block.fenced) {
        block.info = unescapeBackslashes(block.lines.shift().trim());
      } else {
        while (block.lines.length && !/\S/.test(block.lines[block.lines.length - 1])) block.lines.pop();
      }
    },
    canContain: never,
    acceptsLines: true,
  },

  paragraph: {
    proceed: (parser) => (parser.line.blank ? NOT_MATCHED : MATCHED),
    finish(parser, block) {
      block.text = takeReferences(block.lines.join("\n"), parser.references).trim();
      delete block.lines;
      if (!block.text) parser.unlink(block);
    },
    canContain: never,
    acceptsLines: true,
  },

  table: {
    proceed: (parser) => (parser.line.blank ? NOT_MATCHED : MATCHED),
    finish: nothing,
    canContain: never,
    acceptsLines: true,
  },
};
