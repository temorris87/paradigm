// The folders in Resources as the server lists them, and what each holds. A folder is only a
// name: it holds resource notes (top-level notes of kind "resource", by their folder_id) and
// other folders. Folders never appear in a note's path or links. Pure.
//
//   const folders = new Folders([{ id, parent_id, title }, ...]);
//   folders.children(id | null)       its folders by title (null: the top of Resources)
//   folders.path(id)                  the top folder first, this one last
//   folders.inside(id)                ids of it and every folder in it
//   folderOf(tree, folders, noteId)   the folder a resource note is in (its top note's), or null
//   notesIn(tree, folders, folderId)  the live resource notes directly in it (null: in none)
//   countIn(tree, folders, folderId)  how many notes are in it and in its folders
import { titleKey } from "../notes/titles.js";

const byTitle = (a, b) => titleKey(a.title).localeCompare(titleKey(b.title)) || a.id - b.id;

export class Folders {
  constructor(list = []) {
    this.byId = new Map(list.map((folder) => [folder.id, folder]));
    this.kids = new Map([[null, []]]);
    for (const folder of list) {
      const parent = this.byId.has(folder.parent_id) ? folder.parent_id : null;
      if (!this.kids.has(parent)) this.kids.set(parent, []);
      this.kids.get(parent).push(folder);
    }
    for (const kids of this.kids.values()) kids.sort(byTitle);
  }

  get size() {
    return this.byId.size;
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  has(id) {
    return this.byId.has(id);
  }

  parentId(id) {
    const parent = this.byId.get(id)?.parent_id ?? null;
    return this.byId.has(parent) ? parent : null;
  }

  children(id) {
    return this.kids.get(id ?? null) ?? [];
  }

  path(id) {
    const out = [];
    for (let at = id; at !== null && this.byId.has(at) && !out.some((f) => f.id === at); at = this.parentId(at)) {
      out.unshift(this.byId.get(at));
    }
    return out;
  }

  inside(id) {
    const out = [id];
    for (const kid of this.children(id)) out.push(...this.inside(kid.id));
    return out;
  }

  /** Every folder, depth first, each with its depth (a picker's list). */
  inOrder(from = null, depth = 0, out = []) {
    for (const folder of this.children(from)) {
      out.push({ folder, depth });
      this.inOrder(folder.id, depth + 1, out);
    }
    return out;
  }
}

/** The folder a note is in: its top-level note's, when that is a live resource in a known
 * folder (else null: the top of Resources, or not in Resources at all). */
export function folderOf(tree, folders, noteId) {
  if (!tree.has(noteId)) return null;
  const top = tree.path(noteId)[0];
  if (top.kind !== "resource" || top.archived_at) return null;
  return folders.has(top.folder_id) ? top.folder_id : null;
}

export function notesIn(tree, folders, folderId) {
  return tree.children(null).filter((note) => note.kind === "resource" && !note.archived_at
    && (folders.has(note.folder_id) ? note.folder_id : null) === (folderId ?? null));
}

export function countIn(tree, folders, folderId) {
  return folders.inside(folderId).reduce((sum, id) => sum + notesIn(tree, folders, id).length, 0);
}
