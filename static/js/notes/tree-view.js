// The notes tree in the sidebar: an ARIA tree with one focusable item (roving tabindex).
// The top level is the hub groups and the Archive (hub-groups.js); the notes sit under them.
// Meetings, decisions, questions and milestones are not in it: their hub's page lists them.
// A project's phases are, tagged "Phase".
//
// Resources holds folders (static/js/resources/): each folder's folders, then its notes, and
// the notes in no folder after the folders.
//
//   const view = new TreeView(ulElement, { onOpen(id), onLeave(), onAdd(group, anchor),
//     onAddUnder(id), onOpenFolder(id), onAddInFolder(id, anchor) });
//   view.show(tree, currentId, { marked?, folders? })  draw (the open note's group, folders and
//                                  ancestors are expanded); marked false: a page is shown, no
//                                  row is current; folders: a Folders (resources/folders-model.js)
//   view.focus()
//
// Each row has a key: a note's id (a number), "group:<key>" for a group heading, or
// "folder:<id>" for a folder. Which branches and folders are open and which groups are folded
// are remembered in localStorage, per browser. A group folded by default (the Archive) is
// remembered the other way round: when unfolded. Each group a note can be made in (not the
// Archive) has a + on its heading: onAdd(group, anchor).
import { Folders, folderOf, notesIn } from "../resources/folders-model.js";
import { ARCHIVE_GROUP, NAV_GROUPS, groupForKind, groupOf, hubsIn, isRecordKind } from "./hub-groups.js";
import { treeAction } from "./tree-keys.js";

const STORE_KEY = "paradigm.tree.expanded";
const FOLDERS_KEY = "paradigm.tree.openFolders";
const FOLDED_KEY = "paradigm.tree.foldedGroups";
const UNFOLDED_KEY = "paradigm.tree.unfoldedGroups";

const groupKey = (group) => `group:${group.key}`;
const folderKey = (id) => `folder:${id}`;
const isGroupKey = (key) => typeof key === "string" && key.startsWith("group:");
const isFolderKey = (key) => typeof key === "string" && key.startsWith("folder:");
const folderIdOf = (key) => Number(key.slice("folder:".length));

export class TreeView {
  constructor(root, { onOpen, onLeave, onAdd = () => {}, onAddUnder = () => {}, onOpenFolder = () => {},
    onAddInFolder = () => {} }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.onAdd = onAdd;
    this.onAddUnder = onAddUnder;
    this.onOpenFolder = onOpenFolder;
    this.onAddInFolder = onAddInFolder;
    this.folders = new Folders();
    this.openFolders = loadIds(FOLDERS_KEY, Number.isInteger);
    this.tree = null;
    this.current = null;
    this.currentParent = null;
    this.active = null;
    this.expanded = loadIds(STORE_KEY, Number.isInteger);
    this.folded = loadFolded();
    root.setAttribute("role", "tree");
    root.addEventListener("keydown", (event) => this.onKeyDown(event));
    root.addEventListener("click", (event) => this.onClick(event));
    root.addEventListener("focusin", (event) => {
      const item = event.target.closest?.("[role=treeitem]");
      if (item) this.active = keyOf(item);
    });
  }

  show(tree, openId, { marked = true, folders = this.folders } = {}) {
    this.tree = tree;
    this.folders = folders;
    this.marked = marked;
    // A meeting, decision or question isn't in the tree: its hub stands for it.
    const currentId = isRecordKind(tree.get(openId)?.kind) ? tree.parentId(openId) : openId;
    // A note just opened, or the open note moved: show where it is now.
    const parent = tree.parentId(currentId);
    const group = groupOf(tree, currentId);
    if (currentId !== this.current || parent !== this.currentParent || group !== this.currentGroup) {
      for (const id of tree.ancestors(openId)) this.expanded.add(id);
      if (group) this.folded.delete(group.key);
      const folder = folderOf(tree, folders, currentId);
      if (folder !== null) for (const each of folders.path(folder)) this.openFolders.add(each.id);
      this.active = currentId;
    }
    this.current = currentId;
    this.currentParent = parent;
    this.currentGroup = group;
    if (!this.exists(this.active)) this.active = currentId;
    this.redraw();
  }

  redraw() {
    const hadFocus = this.root.contains(document.activeElement);
    this.root.replaceChildren(...NAV_GROUPS.map((group) => this.groupItem(group)));
    if (hadFocus) this.focus();
  }

  /** A note's children as the tree shows them: meetings, decisions and questions are left out
   * (they live on their hub's page). */
  kids(id) {
    return this.tree.children(id).filter((note) => !isRecordKind(note.kind));
  }

  exists(key) {
    if (isFolderKey(key)) return this.folders.has(folderIdOf(key));
    return isGroupKey(key) ? NAV_GROUPS.some((group) => groupKey(group) === key) : this.tree.has(key);
  }

  /** What a group shows under its heading: Resources its folders, then the notes in none. */
  groupRows(group) {
    if (!group.folders) return hubsIn(this.tree, group).map((note) => ({ note }));
    return [...this.folders.children(null).map((folder) => ({ folder })),
      ...notesIn(this.tree, this.folders, null).map((note) => ({ note }))];
  }

  folderRows(id) {
    return [...this.folders.children(id).map((folder) => ({ folder })),
      ...notesIn(this.tree, this.folders, id).map((note) => ({ note }))];
  }

  rowKey(entry) {
    return entry.folder ? folderKey(entry.folder.id) : entry.note.id;
  }

  groupItem(group) {
    const hubs = hubsIn(this.tree, group);
    const rows = this.groupRows(group);
    const open = !this.folded.has(group.key);
    const li = this.treeItem(groupKey(group), 1);
    li.classList.add("tree__item--group");
    li.dataset.group = group.key;
    li.setAttribute("aria-expanded", String(open));
    if (!rows.length) li.classList.add("tree__item--empty");
    const count = document.createElement("span");
    count.className = "tree__count";
    count.textContent = String(hubs.length);
    const row = this.row(rows.length ? (open ? "▾" : "▸") : "", group.heading, "tree__heading", count);
    if (group !== ARCHIVE_GROUP) {
      const add = document.createElement("button");
      add.type = "button";
      add.tabIndex = -1;
      add.className = "mini-button tree__add";
      add.textContent = "+";
      add.title = `${addLabel(group)} (a)`;
      add.setAttribute("aria-label", addLabel(group));
      row.insertBefore(add, count);
    }
    li.append(row);
    if (open && rows.length) li.append(this.group(rows, 2, Boolean(group.showsKind)));
    return li;
  }

  /** A folder: its name (a click opens its page in the main window), its folders and notes. */
  folderItem(folder, level) {
    const rows = this.folderRows(folder.id);
    const open = rows.length > 0 && this.openFolders.has(folder.id);
    const li = this.treeItem(folderKey(folder.id), level);
    li.classList.add("tree__item--folder");
    li.dataset.folder = String(folder.id);
    if (rows.length) li.setAttribute("aria-expanded", String(open));
    const mark = document.createElement("span");
    mark.className = "tree__folder-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "/";
    li.append(this.row(rows.length ? (open ? "▾" : "▸") : "", folder.title, "tree__title tree__title--folder", mark));
    if (open) li.append(this.group(rows, level + 1));
    return li;
  }

  // withKind: an archived hub says what it was ("Project"), since its group is the Archive.
  item(note, level, withKind = false) {
    const kids = this.kids(note.id);
    const open = kids.length > 0 && this.expanded.has(note.id);
    const li = this.treeItem(note.id, level);
    li.setAttribute("aria-selected", String(this.marked !== false && note.id === this.current));
    li.dataset.id = String(note.id);
    if (kids.length) li.setAttribute("aria-expanded", String(open));
    let kind = null;
    if (withKind || note.kind === "phase") {
      kind = document.createElement("span");
      kind.className = "tree__kind";
      kind.textContent = note.kind === "phase" ? "Phase" : groupForKind(note.kind).label;
    }
    li.append(this.row(kids.length ? (open ? "▾" : "▸") : "", note.title, "tree__title", kind));
    if (open) li.append(this.group(kids.map((each) => ({ note: each })), level + 1));
    return li;
  }

  treeItem(key, level) {
    const li = document.createElement("li");
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-level", String(level));
    li.tabIndex = key === this.active ? 0 : -1;
    li.className = "tree__item";
    return li;
  }

  row(arrow, text, textClass, extra = null) {
    const row = document.createElement("div");
    row.className = "tree__row";
    const twisty = document.createElement("span");
    twisty.className = "tree__twisty";
    twisty.setAttribute("aria-hidden", "true");
    twisty.textContent = arrow;
    const title = document.createElement("span");
    title.className = textClass;
    title.textContent = text;
    row.append(twisty, title);
    if (extra) row.append(extra);
    return row;
  }

  /** rows: [{ note } | { folder }] */
  group(rows, level, withKind = false) {
    const group = document.createElement("ul");
    group.setAttribute("role", "group");
    group.className = "tree__group";
    group.append(...rows.map((entry) => (entry.folder ? this.folderItem(entry.folder, level) : this.item(entry.note, level, withKind))));
    return group;
  }

  focus() {
    const item = this.itemNode(this.active) ?? this.root.querySelector("[role=treeitem]");
    item?.focus();
  }

  itemNode(key) {
    return [...this.root.querySelectorAll("[role=treeitem]")].find((node) => keyOf(node) === key) ?? null;
  }

  /** The rows as shown, top to bottom (folded groups and collapsed branches skipped). */
  visible() {
    const out = [];
    const walk = (rows) => {
      for (const entry of rows) {
        const key = this.rowKey(entry);
        out.push(key);
        if (this.isOpen(key)) walk(this.childRows(key));
      }
    };
    for (const group of NAV_GROUPS) {
      out.push(groupKey(group));
      if (!this.folded.has(group.key)) walk(this.groupRows(group));
    }
    return out;
  }

  childRows(key) {
    if (isFolderKey(key)) return this.folderRows(folderIdOf(key));
    if (isGroupKey(key)) return this.groupRows(NAV_GROUPS.find((each) => groupKey(each) === key));
    return this.kids(key).map((note) => ({ note }));
  }

  /** What a row holds: a group's hubs (Resources: its folders and notes), a folder's folders
   * and notes, or a note's children. */
  childKeys(key) {
    return this.childRows(key).map((entry) => this.rowKey(entry));
  }

  isOpen(key) {
    if (isFolderKey(key)) return this.openFolders.has(folderIdOf(key));
    return isGroupKey(key) ? !this.folded.has(key.slice("group:".length)) : this.expanded.has(key);
  }

  parentKey(key) {
    if (isGroupKey(key)) return key;
    if (isFolderKey(key)) {
      const parent = this.folders.parentId(folderIdOf(key));
      return parent === null ? "group:resource" : folderKey(parent);
    }
    const parent = this.tree.parentId(key);
    if (parent !== null) return parent;
    const folder = folderOf(this.tree, this.folders, key);
    return folder !== null ? folderKey(folder) : groupKey(groupOf(this.tree, key));
  }

  onClick(event) {
    const item = event.target.closest?.("[role=treeitem]");
    if (!item) return;
    const key = keyOf(item);
    if (event.target.closest(".tree__add")) return this.add(key, event.target.closest(".tree__add"));
    if (isGroupKey(key)) return this.setOpen(key, !this.isOpen(key));
    if (isFolderKey(key) && !event.target.closest(".tree__twisty")) return this.onOpenFolder(folderIdOf(key));
    if (event.target.closest(".tree__twisty") && this.childKeys(key).length) {
      this.setOpen(key, !this.isOpen(key));
      return;
    }
    this.onOpen(key);
  }

  onKeyDown(event) {
    const action = treeAction(event);
    if (!action || this.active === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.perform(action);
  }

  perform(action) {
    const key = this.active;
    const shown = this.visible();
    const at = shown.indexOf(key);
    const kids = this.childKeys(key);
    switch (action) {
      case "next": return this.moveTo(shown[Math.min(at + 1, shown.length - 1)]);
      case "previous": return this.moveTo(shown[Math.max(at - 1, 0)]);
      case "first": return this.moveTo(shown[0]);
      case "last": return this.moveTo(shown[shown.length - 1]);
      case "expand":
        if (!kids.length) return;
        return this.isOpen(key) ? this.moveTo(kids[0]) : this.setOpen(key, true);
      case "collapse":
        if (kids.length && this.isOpen(key)) return this.setOpen(key, false);
        return this.moveTo(this.parentKey(key));
      case "open":
        if (isFolderKey(key)) return this.onOpenFolder(folderIdOf(key));
        return isGroupKey(key) ? this.setOpen(key, !this.isOpen(key)) : this.onOpen(key);
      case "add": return this.add(key);
      case "editor": return this.onLeave();
    }
  }

  add(key, anchor = null) {
    const row = anchor ?? this.itemNode(key)?.querySelector(".tree__row") ?? null;
    if (isFolderKey(key)) return this.onAddInFolder(folderIdOf(key), row);
    if (!isGroupKey(key)) return this.onAddUnder(key);
    const group = NAV_GROUPS.find((each) => groupKey(each) === key);
    if (group !== ARCHIVE_GROUP) this.onAdd(group, row);
  }

  moveTo(key) {
    if (key === undefined || key === null) return;
    this.active = key;
    for (const node of this.root.querySelectorAll("[role=treeitem]")) node.tabIndex = keyOf(node) === key ? 0 : -1;
    this.itemNode(key)?.focus();
  }

  setOpen(key, open) {
    if (isFolderKey(key)) {
      if (open) this.openFolders.add(folderIdOf(key));
      else this.openFolders.delete(folderIdOf(key));
      saveIds(FOLDERS_KEY, this.openFolders);
    } else if (isGroupKey(key)) {
      const name = key.slice("group:".length);
      if (open) this.folded.delete(name);
      else this.folded.add(name);
      saveFolded(this.folded);
    } else {
      if (open) this.expanded.add(key);
      else this.expanded.delete(key);
      saveIds(STORE_KEY, this.expanded);
    }
    this.redraw();
  }
}

/** "New project", "New person", "New note" (the Inbox), "New note or folder" (Resources). */
export function addLabel(group) {
  if (group.folders) return "New note or folder";
  return group.kind ? `New ${group.label.toLowerCase()}` : "New note";
}

function keyOf(item) {
  if (item.dataset.group) return `group:${item.dataset.group}`;
  if (item.dataset.folder) return folderKey(Number(item.dataset.folder));
  return Number(item.dataset.id);
}

function loadIds(storeKey, valid) {
  try {
    const ids = JSON.parse(localStorage.getItem(storeKey) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter(valid) : []);
  } catch {
    return new Set();
  }
}

function loadFolded() {
  const known = (key) => NAV_GROUPS.some((group) => group.key === key);
  const folded = loadIds(FOLDED_KEY, known);
  const unfolded = loadIds(UNFOLDED_KEY, known);
  for (const group of NAV_GROUPS) {
    if (group.foldedByDefault && !unfolded.has(group.key)) folded.add(group.key);
    if (group.foldedByDefault && unfolded.has(group.key)) folded.delete(group.key);
  }
  return folded;
}

function saveFolded(folded) {
  const byDefault = (key) => NAV_GROUPS.find((group) => group.key === key)?.foldedByDefault;
  saveIds(FOLDED_KEY, [...folded].filter((key) => !byDefault(key)));
  saveIds(UNFOLDED_KEY, NAV_GROUPS.filter((group) => group.foldedByDefault && !folded.has(group.key)).map((group) => group.key));
}

function saveIds(storeKey, ids) {
  try {
    localStorage.setItem(storeKey, JSON.stringify([...ids]));
  } catch {
    // Storage full or off: the tree just forgets which branches were open.
  }
}
