// One source line as the block parser reads it: a position that moves past container
// markers (">", list markers, indentation) and knows columns, so a tab counts as spaces up
// to the next multiple of 4. A tab can be half consumed; remainder() makes up the spaces.

export const TAB_STOP = 4;

export function isSpaceOrTab(char) {
  return char === " " || char === "\t";
}

export class LineCursor {
  constructor(text, number) {
    this.text = text;
    this.number = number;
    this.offset = 0;
    this.column = 0;
    this.partialTab = false;
    this.findNextNonspace();
  }

  findNextNonspace() {
    let index = this.offset;
    let columns = this.column;
    while (index < this.text.length) {
      const char = this.text[index];
      if (char === " ") columns += 1;
      else if (char === "\t") columns += TAB_STOP - (columns % TAB_STOP);
      else break;
      index += 1;
    }
    this.nextNonspace = index;
    this.nextNonspaceColumn = columns;
    this.indent = columns - this.column;
    this.indented = this.indent >= TAB_STOP;
    this.blank = index >= this.text.length;
  }

  /** The character at the next non-space (default) or at `index`. */
  peek(index = this.nextNonspace) {
    return this.text[index] ?? "";
  }

  /** The line from the next non-space on. */
  rest() {
    return this.text.slice(this.nextNonspace);
  }

  advanceNextNonspace() {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partialTab = false;
  }

  /** Move on `count` characters, or `count` columns when `columns` is set. */
  advanceOffset(count, columns = false) {
    while (count > 0 && this.offset < this.text.length) {
      if (this.text[this.offset] === "\t") {
        const toTab = TAB_STOP - (this.column % TAB_STOP);
        if (columns) {
          this.partialTab = toTab > count;
          const step = Math.min(toTab, count);
          this.column += step;
          if (!this.partialTab) this.offset += 1;
          count -= step;
        } else {
          this.partialTab = false;
          this.column += toTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partialTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  }

  advanceToEnd() {
    this.advanceOffset(this.text.length - this.offset);
  }

  /** What is left of the line, with a half-consumed tab turned into spaces. */
  remainder() {
    if (!this.partialTab) return this.text.slice(this.offset);
    const spaces = TAB_STOP - (this.column % TAB_STOP);
    return " ".repeat(spaces) + this.text.slice(this.offset + 1);
  }
}
