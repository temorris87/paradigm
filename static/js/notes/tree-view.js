// The notes tree in the sidebar: an ARIA tree with one focusable item (roving tabindex).
// The top level is the four hub groups (hub-groups.js); the notes sit under them.
//
//   const view = new TreeView(ulElement, { onOpen(id), onLeave() });
//   view.show(tree, currentId)     draw (the open note's group and ancestors are expanded)
//   view.focus()
//
// Each row has a key: a note's id (a number) or "group:<key>" for a group heading. Which
// branches are open and which groups are folded are remembered in localStorage, per browser.
import { HUB_GROUPS, groupOf, hubsIn } from "./hub-groups.js";
import { treeAction } from "./tree-keys.js";

const STORE_KEY = "paradigm.tree.expanded";
const FOLDED_KEY = "paradigm.tree.foldedGroups";

const groupKey = (group) => `group:${group.key}`;
const isGroupKey = (key) => typeof key === "string";

export class TreeView {
  constructor(root, { onOpen, onLeave }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.tree = null;
    this.current = null;
    this.currentParent = null;
    this.active = null;
    this.expanded = loadIds(STORE_KEY, Number.isInteger);
    this.folded = loadIds(FOLDED_KEY, (key) => HUB_GROUPS.some((group) => group.key === key));
    root.setAttribute("role", "tree");
    root.addEventListener("keydown", (event) => this.onKeyDown(event));
    root.addEventListener("click", (event) => this.onClick(event));
    root.addEventListener("focusin", (event) => {
      const item = event.target.closest?.("[role=treeitem]");
      if (item) this.active = keyOf(item);
    });
  }

  show(tree, currentId) {
    this.tree = tree;
    // A note just opened, or the open note moved: show where it is now.
    const parent = tree.parentId(currentId);
    const group = groupOf(tree, currentId);
    if (currentId !== this.current || parent !== this.currentParent || group !== this.currentGroup) {
      for (const id of tree.ancestors(currentId)) this.expanded.add(id);
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
    this.root.replaceChildren(...HUB_GROUPS.map((group) => this.groupItem(group)));
    if (hadFocus) this.focus();
  }

  exists(key) {
    return isGroupKey(key) ? HUB_GROUPS.some((group) => groupKey(group) === key) : this.tree.has(key);
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
    li.append(this.row(hubs.length ? (open ? "▾" : "▸") : "", group.heading, "tree__heading", count));
    if (open && hubs.length) li.append(this.group(hubs, 2));
    return li;
  }

  item(note, level) {
    const kids = this.tree.children(note.id);
    const open = kids.length > 0 && this.expanded.has(note.id);
    const li = this.treeItem(note.id, level);
    li.setAttribute("aria-selected", String(note.id === this.current));
    li.dataset.id = String(note.id);
    if (kids.length) li.setAttribute("aria-expanded", String(open));
    li.append(this.row(kids.length ? (open ? "▾" : "▸") : "", note.title, "tree__title"));
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

  group(notes, level) {
    const group = document.createElement("ul");
    group.setAttribute("role", "group");
    group.className = "tree__group";
    group.append(...notes.map((note) => this.item(note, level)));
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
        if (this.expanded.has(note.id)) walk(this.tree.children(note.id));
      }
    };
    for (const group of HUB_GROUPS) {
      out.push(groupKey(group));
      if (!this.folded.has(group.key)) walk(hubsIn(this.tree, group));
    }
    return out;
  }

  /** What a row holds: a group's hubs, or a note's children. */
  childKeys(key) {
    if (!isGroupKey(key)) return this.tree.children(key).map((note) => note.id);
    const group = HUB_GROUPS.find((each) => groupKey(each) === key);
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
      case "editor": return this.onLeave();
    }
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
      saveIds(FOLDED_KEY, this.folded);
    } else {
      if (open) this.expanded.add(key);
      else this.expanded.delete(key);
      saveIds(STORE_KEY, this.expanded);
    }
    this.redraw();
  }
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

function saveIds(storeKey, ids) {
  try {
    localStorage.setItem(storeKey, JSON.stringify([...ids]));
  } catch {
    // Storage full or off: the tree just forgets which branches were open.
  }
}
