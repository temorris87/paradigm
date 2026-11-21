// List items: reading a marker ("-", "*", "+", "1.", "1)"), deciding whether a list is
// tight (no <p> in its items), and task boxes ("- [ ]", "- [x]").
import { isSpaceOrTab } from "./lines.js";

/** Read a list marker at the cursor and move past it, or return null and move nothing. */
export function readListMarker(line, container) {
  if (line.indent >= 4) return null;
  const rest = line.rest();
  const interrupting = container.type === "paragraph";
  let match;
  let marker;
  if ((match = /^[*+-]/.exec(rest))) {
    marker = { ordered: false, bulletChar: match[0] };
  } else if ((match = /^(\d{1,9})([.)])/.exec(rest)) && (!interrupting || match[1] === "1")) {
    marker = { ordered: true, start: Number(match[1]), delimiter: match[2] };
  } else {
    return null;
  }
  const after = rest.slice(match[0].length);
  if (after !== "" && !isSpaceOrTab(after[0])) return null;
  // An empty item cannot interrupt a paragraph.
  if (interrupting && !/[^ \t]/.test(after)) return null;

  marker.markerOffset = line.indent;
  line.advanceNextNonspace();
  line.advanceOffset(match[0].length, true);
  const spacesStartColumn = line.column;
  const spacesStartOffset = line.offset;
  do {
    line.advanceOffset(1, true);
  } while (line.column - spacesStartColumn < 5 && isSpaceOrTab(line.peek(line.offset)));
  const blankItem = line.offset >= line.text.length;
  const spacesAfter = line.column - spacesStartColumn;
  if (spacesAfter >= 5 || spacesAfter < 1 || blankItem) {
    // Content indented 5+ spaces is an indented code block; the item takes only one space.
    marker.padding = match[0].length + 1;
    line.column = spacesStartColumn;
    line.offset = spacesStartOffset;
    line.partialTab = false;
    if (isSpaceOrTab(line.peek(line.offset))) line.advanceOffset(1, true);
  } else {
    marker.padding = match[0].length + spacesAfter;
  }
  return marker;
}

export function sameListKind(a, b) {
  return a.ordered === b.ordered && a.bulletChar === b.bulletChar && a.delimiter === b.delimiter;
}

/** A list is loose if a blank line separates any two of its items or their blocks. */
export function isTight(list) {
  const items = list.children;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const lastItem = i === items.length - 1;
    if (endsWithBlankLine(item) && !lastItem) return false;
    const blocks = item.children;
    for (let j = 0; j < blocks.length; j += 1) {
      const lastBlock = j === blocks.length - 1;
      if (endsWithBlankLine(blocks[j]) && (!lastItem || !lastBlock)) return false;
    }
  }
  return true;
}

function endsWithBlankLine(block) {
  while (block) {
    if (block.lastLineBlank) return true;
    if (block.type !== "list" && block.type !== "item") return false;
    block = block.children[block.children.length - 1];
  }
  return false;
}

const TASK_BOX = /^\[([ xX])\](?:[ \t]+|$)/;

/** Turn "[ ] text" at the start of an item into a task box. */
export function markTask(item) {
  const first = item.children[0];
  if (!first || first.type !== "paragraph") return;
  const match = TASK_BOX.exec(first.text);
  if (!match) return;
  item.task = { checked: match[1] !== " " };
  first.text = first.text.slice(match[0].length);
  first.taskBox = item.task;
}
