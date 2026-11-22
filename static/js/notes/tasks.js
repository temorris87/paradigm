// Tasks: the "- [ ]" boxes in a note's text. Pure.
//
//   tasksIn(text, field)    [{ field, line, parent, title, done }]: each box the renderer finds
//                           (never in code), its 0-based line, the line of the box it is nested
//                           under (null at the top: a box under a plain bullet is a task of its
//                           own), its text as plain words, and whether it is ticked. Sent with
//                           every save (link-index.js); the server keeps the tasks
//                           (paradigm/db/task_index.py).
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

/** The text with a new task line at its end. */
export function withTaskAdded(text, title) {
  const body = String(text ?? "");
  const line = `- [ ] ${String(title).replace(/\s+/g, " ").trim()}`;
  if (!body.trim()) return line;
  return body.endsWith("\n") ? `${body}${line}` : `${body}\n${line}`;
}
