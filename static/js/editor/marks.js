// Marks: a-z set by the user, plus the ones the editor sets itself:
// ' (before the last jump), < and > (last visual selection), ^ (where insert mode stopped).
// They live only as long as the editor; nothing is saved.
import { comparePos, endAfter, pos } from "./position.js";

export class Marks {
  constructor() {
    this.marks = new Map();
  }

  set(name, position) {
    this.marks.set(name, pos(position.line, position.col));
  }

  get(name) {
    return this.marks.get(name) ?? null;
  }

  clear() {
    this.marks.clear();
  }

  /** Keep marks on the same text when lines are added or removed above them. */
  adjust(change) {
    const removedEnd = endAfter(change.start, change.removed);
    const lineDelta = countNewlines(change.inserted) - countNewlines(change.removed);
    if (lineDelta === 0) return;
    for (const [name, mark] of this.marks) {
      if (comparePos(mark, removedEnd) >= 0) {
        this.marks.set(name, pos(mark.line + lineDelta, mark.col));
      } else if (comparePos(mark, change.start) > 0) {
        this.marks.set(name, pos(change.start.line, mark.col));
      }
    }
  }
}

function countNewlines(text) {
  let count = 0;
  for (const char of text) if (char === "\n") count += 1;
  return count;
}
