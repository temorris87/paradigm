// The text being edited, as an array of lines. One primitive, replace(), makes every change,
// and returns a record that the undo history can play backwards.
import { pos } from "./position.js";

export class Buffer {
  constructor(text = "") {
    this.version = 0;
    this.setText(text);
  }

  setText(text) {
    this.lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    this.version += 1;
  }

  getText() {
    return this.lines.join("\n");
  }

  get lineCount() {
    return this.lines.length;
  }

  get lastLine() {
    return this.lines.length - 1;
  }

  line(index) {
    return this.lines[index] ?? "";
  }

  lineLength(index) {
    return this.line(index).length;
  }

  endPos() {
    return pos(this.lastLine, this.lineLength(this.lastLine));
  }

  /** The text from start up to (not including) end. */
  slice(start, end) {
    if (start.line === end.line) return this.line(start.line).slice(start.col, end.col);
    const parts = [this.line(start.line).slice(start.col)];
    for (let index = start.line + 1; index < end.line; index += 1) parts.push(this.lines[index]);
    parts.push(this.line(end.line).slice(0, end.col));
    return parts.join("\n");
  }

  /** Replace the text from start to end with text. Returns { start, removed, inserted }. */
  replace(start, end, text) {
    const removed = this.slice(start, end);
    const before = this.line(start.line).slice(0, start.col);
    const after = this.line(end.line).slice(end.col);
    const parts = text.split("\n");
    parts[0] = before + parts[0];
    parts[parts.length - 1] += after;
    this.lines.splice(start.line, end.line - start.line + 1, ...parts);
    this.version += 1;
    return { start: pos(start.line, start.col), removed, inserted: text };
  }
}
