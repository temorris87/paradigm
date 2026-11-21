// The note hierarchy as the server lists it (no bodies), with lookups. Pure.
//
//   const tree = new NoteTree([{ id, parent_id, title, ... }, ...]);
//   tree.children(id | null)   sorted by title; null means the top level
//   tree.ancestors(id)         parent first, top-level note last
//   tree.path(id)              top-level note first, the note itself last
import { titleKey } from "./titles.js";

const byTitle = (a, b) => titleKey(a.title).localeCompare(titleKey(b.title)) || a.id - b.id;

export class NoteTree {
  constructor(notes = []) {
    this.notes = new Map(notes.map((note) => [note.id, note]));
    this.kids = new Map([[null, []]]);
    for (const note of notes) {
      // A parent that isn't listed (it can't happen, but never lose a note): show it on top.
      const parent = this.notes.has(note.parent_id) ? note.parent_id : null;
      if (!this.kids.has(parent)) this.kids.set(parent, []);
      this.kids.get(parent).push(note);
    }
    for (const list of this.kids.values()) list.sort(byTitle);
  }

  get size() {
    return this.notes.size;
  }

  get(id) {
    return this.notes.get(id) ?? null;
  }

  has(id) {
    return this.notes.has(id);
  }

  parentId(id) {
    const parent = this.notes.get(id)?.parent_id ?? null;
    return this.notes.has(parent) ? parent : null;
  }

  children(id) {
    return this.kids.get(id ?? null) ?? [];
  }

  siblings(id) {
    return this.children(this.parentId(id));
  }

  ancestors(id) {
    const found = [];
    for (let at = this.parentId(id); at !== null && !found.includes(at); at = this.parentId(at)) found.push(at);
    return found;
  }

  path(id) {
    return [...this.ancestors(id).reverse(), id].map((each) => this.notes.get(each));
  }

  /** "/Projects/Acme": the path a link or :e can always use to name this note. */
  pathText(id) {
    return `/${this.path(id).map((note) => note.title).join("/")}`;
  }

  /** Every note in tree order (depth first, siblings by title). */
  inOrder(from = null, out = []) {
    for (const note of this.children(from)) {
      out.push(note);
      this.inOrder(note.id, out);
    }
    return out;
  }

  /** The note in a list whose title matches (exact case first, then ignoring case). */
  static pick(notes, title) {
    const key = titleKey(title);
    const matches = notes.filter((note) => titleKey(note.title) === key);
    return matches.find((note) => note.title === title) ?? matches[0] ?? null;
  }
}
