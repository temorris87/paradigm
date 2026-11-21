// Undo history: a list of change groups. One normal-mode command, or one whole insert
// session, is one group, so a single "u" takes it all back (as in Vim).
import { endAfter } from "./position.js";

export class UndoHistory {
  constructor() {
    this.groups = [];
    this.index = 0; // groups before index are done; from index on they are redoable
    this.current = null;
  }

  /** Open a group if none is open. cursor is where the cursor was before the command. */
  begin(cursor) {
    if (!this.current) this.current = { changes: [], before: { ...cursor } };
  }

  record(change) {
    this.current.changes.push(change);
  }

  get isOpen() {
    return this.current !== null;
  }

  /** Close the open group; an empty group is dropped. */
  end() {
    const group = this.current;
    this.current = null;
    if (!group || group.changes.length === 0) return;
    this.groups.length = this.index;
    this.groups.push(group);
    this.index += 1;
  }

  /** Play the last group backwards. Returns where the cursor goes, or null if nothing to undo. */
  undo(buffer) {
    this.end();
    if (this.index === 0) return null;
    this.index -= 1;
    const group = this.groups[this.index];
    for (const change of [...group.changes].reverse()) {
      buffer.replace(change.start, endAfter(change.start, change.inserted), change.removed);
    }
    return { cursor: group.before, changes: group.changes.map(invert) };
  }

  /** Play the next undone group forwards. Returns where the cursor goes, or null. */
  redo(buffer) {
    this.end();
    if (this.index === this.groups.length) return null;
    const group = this.groups[this.index];
    this.index += 1;
    for (const change of group.changes) {
      buffer.replace(change.start, endAfter(change.start, change.removed), change.inserted);
    }
    return { cursor: group.changes[0].start, changes: group.changes };
  }

  clear() {
    this.groups = [];
    this.index = 0;
    this.current = null;
  }
}

function invert(change) {
  return { start: change.start, removed: change.inserted, inserted: change.removed };
}
