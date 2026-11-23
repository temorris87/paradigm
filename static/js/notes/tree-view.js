// The notes tree in the sidebar: an ARIA tree with one focusable item (roving tabindex).
// The top level is the hub groups and the Archive (hub-groups.js); the notes sit under them.
// Meetings, decisions, questions and milestones are not in it: their hub's page lists them.
// A project's phases are, tagged "Phase".
//
//   const view = new TreeView(ulElement, { onOpen(id), onLeave(), onAdd(group), onAddUnder(id) });
//   view.show(tree, currentId, { marked? })  draw (the open note's group and ancestors are
//                                  expanded); marked false: a page is shown, no row is current
//   view.focus()
//
// Each row has a key: a note's id (a number) or "group:<key>" for a group heading. Which
// branches are open and which groups are folded are remembered in localStorage, per browser.
// A group folded by default (the Archive) is remembered the other way round: when unfolded.
// Each group a note can be made in (not the Archive) has a + on its heading: onAdd(group).
import { ARCHIVE_GROUP, NAV_GROUPS, groupForKind, groupOf, hubsIn, isRecordKind } from "./hub-groups.js";
import { treeAction } from "./tree-keys.js";

const STORE_KEY = "paradigm.tree.expanded";
const FOLDED_KEY = "paradigm.tree.foldedGroups";
const UNFOLDED_KEY = "paradigm.tree.unfoldedGroups";

const groupKey = (group) => `group:${group.key}`;
const isGroupKey = (key) => typeof key === "string";

export class TreeView {
  constructor(root, { onOpen, onLeave, onAdd = () => {}, onAddUnder = () => {} }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.onAdd = onAdd;
    this.onAddUnder = onAddUnder;
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

  show(tree, openId, { marked = true } = {}) {
    this.tree = tree;
    this.marked = marked;
    // A meeting, decision or question isn't in the tree: its hub stands for it.
    const currentId = isRecordKind(tree.get(openId)?.kind) ? tree.parentId(openId) : openId;
    // A note just opened, or the open note moved: show where it is now.
    const parent = tree.parentId(currentId);
    const group = groupOf(tree, currentId);
    if (currentId !== this.current || parent !== this.currentParent || group !== this.currentGroup) {
      for (const id of tree.ancestors(openId)) this.expanded.add(id);
      if (group) this.folded.delete(group.key);
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
    return isGroupKey(key) ? NAV_GROUPS.some((group) => groupKey(group) === key) : this.tree.has(key);
  }

  groupItem(group) {
    const hubs = hubsIn(this.tree, group);
    const open = !this.folded.has(group.key);
    const li = this.treeItem(groupKey(group), 1);
    li.classList.add("tree__item--group");
    li.dataset.group = group.key;
    li.setAttribute("aria-expanded", String(open));
    if (!hubs.length) li.classList.add("tree__item--empty");
    const count = document.createElement("span");
    count.className = "tree__count";
    count.textContent = String(hubs.length);
    const row = this.row(hubs.length ? (open ? "▾" : "▸") : "", group.heading, "tree__heading", count);
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
    if (open && hubs.length) li.append(this.group(hubs, 2, Boolean(group.showsKind)));
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
    if (open) li.append(this.group(kids, level + 1));
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

  group(notes, level, withKind = false) {
    const group = document.createElement("ul");
    group.setAttribute("role", "group");
    group.className = "tree__group";
    group.append(...notes.map((note) => this.item(note, level, withKind)));
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
    const walk = (notes) => {
      for (const note of notes) {
        out.push(note.id);
        if (this.expanded.has(note.id)) walk(this.kids(note.id));
      }
    };
    for (const group of NAV_GROUPS) {
      out.push(groupKey(group));
      if (!this.folded.has(group.key)) walk(hubsIn(this.tree, group));
    }
    return out;
  }

  /** What a row holds: a group's hubs, or a note's children. */
  childKeys(key) {
    if (!isGroupKey(key)) return this.kids(key).map((note) => note.id);
    const group = NAV_GROUPS.find((each) => groupKey(each) === key);
    return hubsIn(this.tree, group).map((note) => note.id);
  }

  isOpen(key) {
    return isGroupKey(key) ? !this.folded.has(key.slice("group:".length)) : this.expanded.has(key);
  }

  parentKey(key) {
    if (isGroupKey(key)) return key;
    const parent = this.tree.parentId(key);
    return parent ?? groupKey(groupOf(this.tree, key));
  }

  onClick(event) {
    const item = event.target.closest?.("[role=treeitem]");
    if (!item) return;
    const key = keyOf(item);
    if (event.target.closest(".tree__add")) return this.add(key);
    if (isGroupKey(key)) return this.setOpen(key, !this.isOpen(key));
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
        return isGroupKey(key) ? this.setOpen(key, !this.isOpen(key)) : this.onOpen(key);
      case "add": return this.add(key);
      case "editor": return this.onLeave();
    }
  }

  add(key) {
    if (!isGroupKey(key)) return this.onAddUnder(key);
    const group = NAV_GROUPS.find((each) => groupKey(each) === key);
    if (group !== ARCHIVE_GROUP) this.onAdd(group);
  }

  moveTo(key) {
    if (key === undefined || key === null) return;
    this.active = key;
    for (const node of this.root.querySelectorAll("[role=treeitem]")) node.tabIndex = keyOf(node) === key ? 0 : -1;
    this.itemNode(key)?.focus();
  }

  setOpen(key, open) {
    if (isGroupKey(key)) {
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

/** "New project", "New person", "New note" (the Inbox). */
export function addLabel(group) {
  return group.kind ? `New ${group.label.toLowerCase()}` : "New note";
}

function keyOf(item) {
  return item.dataset.group ? `group:${item.dataset.group}` : Number(item.dataset.id);
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
