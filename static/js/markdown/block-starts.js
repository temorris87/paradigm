// Recognising the start of a new block on the rest of a line. Each start returns:
//   NONE       not this kind of block
//   CONTAINER  a container opened (quote, list item, footnote); look for more starts after it
//   LEAF       a leaf block opened; the rest of the line belongs to it
import { FOOTNOTE_START } from "./footnotes.js";
import { isSpaceOrTab } from "./lines.js";
import { readListMarker, sameListKind } from "./lists.js";
import { readMathOpener } from "./math.js";
import { takeReferences } from "./references.js";
import { fitRow, readDelimiterRow, splitRow } from "./tables.js";

export const NONE = 0;
export const CONTAINER = 1;
export const LEAF = 2;

// Quotes and lists nest at most this deep; past it their markers are text. Deeper trees
// would overflow the stack when rendered.
export const MAX_NESTING = 50;

const ATX_HEADING = /^#{1,6}(?:[ \t]+|$)/;
const OPENING_FENCE = /^`{3,}(?!.*`)|^~{3,}/;
const SETEXT_UNDERLINE = /^(?:=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;

function blockQuote(parser, container) {
  if (container.depth >= MAX_NESTING) return NONE;
  const line = parser.line;
  if (line.indented || line.peek() !== ">") return NONE;
  line.advanceNextNonspace();
  line.advanceOffset(1);
  if (isSpaceOrTab(line.peek(line.offset))) line.advanceOffset(1, true);
  parser.closeUnmatchedBlocks();
  parser.addChild("quote");
  return CONTAINER;
}

function atxHeading(parser) {
  const line = parser.line;
  const match = !line.indented && ATX_HEADING.exec(line.rest());
  if (!match) return NONE;
  line.advanceNextNonspace();
  line.advanceOffset(match[0].length);
  parser.closeUnmatchedBlocks();
  const heading = parser.addChild("heading");
  heading.level = match[0].trim().length;
  heading.text = line.text
    .slice(line.offset)
    .replace(/^[ \t]*#+[ \t]*$/, "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();
  line.advanceToEnd();
  return LEAF;
}

function fencedCode(parser) {
  const line = parser.line;
  const match = !line.indented && OPENING_FENCE.exec(line.rest());
  if (!match) return NONE;
  parser.closeUnmatchedBlocks();
  const code = parser.addChild("code");
  code.fenced = true;
  code.fenceChar = match[0][0];
  code.fenceLength = match[0].length;
  code.fenceOffset = line.indent;
  line.advanceNextNonspace();
  line.advanceOffset(match[0].length);
  return LEAF; // the rest of this line, the info string, becomes the first "line"
}

// "$$" opens a maths block; what follows it on the line is the first line of TeX.
function mathBlock(parser) {
  const line = parser.line;
  const opener = !line.indented && readMathOpener(line.rest());
  if (!opener) return NONE;
  parser.closeUnmatchedBlocks();
  const math = parser.addChild("math");
  math.closed = opener.closed;
  math.fenceOffset = line.indent;
  line.advanceNextNonspace();
  line.advanceOffset(2);
  return LEAF;
}

function footnoteDefinition(parser, container) {
  if (container.depth >= MAX_NESTING) return NONE;
  const line = parser.line;
  const match = !line.indented && FOOTNOTE_START.exec(line.rest());
  if (!match) return NONE;
  line.advanceNextNonspace();
  line.advanceOffset(match[0].length);
  if (isSpaceOrTab(line.peek(line.offset))) line.advanceOffset(1, true);
  parser.closeUnmatchedBlocks();
  parser.addChild("footnote").label = match[1];
  return CONTAINER;
}

// The paragraph's last line becomes the header row.
function table(parser, container) {
  const line = parser.line;
  if (line.indented || container.type !== "paragraph") return NONE;
  const header = container.lines[container.lines.length - 1];
  const align = readDelimiterRow(line.rest(), header);
  if (!align) return NONE;
  parser.closeUnmatchedBlocks();
  container.lines.pop();
  if (container.lines.length) {
    container.endLine = line.number - 2;
    parser.finalize(container);
  } else {
    parser.unlink(container);
    parser.tip = container.parent;
  }
  const block = parser.addChild("table", line.number - 1);
  block.align = align;
  block.head = fitRow(splitRow(header), align.length);
  block.rows = [];
  line.advanceToEnd();
  return LEAF;
}

function setextHeading(parser, container) {
  const line = parser.line;
  if (line.indented || container.type !== "paragraph") return NONE;
  const match = SETEXT_UNDERLINE.exec(line.rest());
  if (!match) return NONE;
  parser.closeUnmatchedBlocks();
  const text = takeReferences(container.lines.join("\n"), parser.references).trim();
  if (!text) return NONE;
  const heading = parser.replace(container, "heading");
  heading.level = match[0][0] === "=" ? 1 : 2;
  heading.text = text;
  line.advanceToEnd();
  return LEAF;
}

function thematicBreak(parser) {
  const line = parser.line;
  if (line.indented || !THEMATIC_BREAK.test(line.rest())) return NONE;
  parser.closeUnmatchedBlocks();
  parser.addChild("hr");
  line.advanceToEnd();
  return LEAF;
}

function listItem(parser, container) {
  if (container.depth >= MAX_NESTING) return NONE;
  const marker = readListMarker(parser.line, container);
  if (!marker) return NONE;
  parser.closeUnmatchedBlocks();
  if (parser.tip.type !== "list" || !sameListKind(parser.tip, marker)) {
    const list = parser.addChild("list");
    Object.assign(list, { ordered: marker.ordered, bulletChar: marker.bulletChar, delimiter: marker.delimiter });
    if (marker.ordered) list.start = marker.start;
  }
  const item = parser.addChild("item");
  item.markerOffset = marker.markerOffset;
  item.padding = marker.padding;
  return CONTAINER;
}

function indentedCode(parser) {
  const line = parser.line;
  const tip = parser.tip.type;
  if (!line.indented || line.blank || tip === "paragraph" || tip === "table") return NONE;
  line.advanceOffset(4, true);
  parser.closeUnmatchedBlocks();
  parser.addChild("code").fenced = false;
  return LEAF;
}

// Order matters: a table before a setext heading ("a | b" over "---"), a setext heading
// before a thematic break ("---" under a paragraph), a thematic break before a list ("- - -").
export const BLOCK_STARTS = [
  blockQuote,
  atxHeading,
  mathBlock,
  fencedCode,
  footnoteDefinition,
  table,
  setextHeading,
  thematicBreak,
  listItem,
  indentedCode,
];
