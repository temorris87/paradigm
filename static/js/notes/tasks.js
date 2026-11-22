// Checkboxes: the "- [ ]" boxes in a text. They are only Markdown now (tasks are records of
// their own: static/js/tasks/); a click on a rendered one ticks it in the text, and a
// template's boxes become real tasks when it is put into a note (templates/template-text.js).
// Pure.
//
//   tasksIn(text, field)    [{ field, line, parent, title, done }]: each box the renderer finds
//                           (never in code), its 0-based line, the line of the box it is nested
//                           under (null at the top: a box under a plain bullet is a box of its
//                           own), its text as plain words, and whether it is ticked.
import { parseMarkdown } from "../markdown/index.js";
import { plainText } from "../markdown/render-inline.js";

const MAX_TITLE = 500;

export function tasksIn(text, field = "body") {
  const found = [];
  const walk = (blocks, parentLine) => {
    for (const block of blocks) {
      let under = parentLine;
      if (block.type === "item" && block.task) {
        found.push({ field, line: block.startLine, parent: parentLine, title: titleOf(block), done: block.task.checked });
        under = block.startLine;
      }
      if (block.children?.length) walk(block.children, under);
    }
  };
  walk(parseMarkdown(String(text ?? "")).blocks, null);
  return found;
}

function titleOf(item) {
  const first = item.children[0];
  const words = first?.inlines ? plainText(first.inlines) : first?.text ?? "";
  return words.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}

// A list item's box at the start of a line, inside any number of "> " quotes (as the server
// checks it: paradigm/notes/tasks.py BOX).
const BOX = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\]/;

/** Whether a line's box is ticked (null: the line holds no box). */
export function boxState(line) {
  const match = BOX.exec(String(line ?? ""));
  return match ? match[2] !== " " : null;
}

/** The line with its box ticked or cleared. */
export function setBox(line, done) {
  return String(line).replace(BOX, (_, before) => `${before}${done ? "x" : " "}]`);
}
