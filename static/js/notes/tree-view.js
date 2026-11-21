// The notes tree in the sidebar: an ARIA tree with one focusable item (roving tabindex).
//
//   const view = new TreeView(ulElement, { onOpen(id), onLeave() });
//   view.show(tree, currentId)     draw (the open note's ancestors are expanded)
//   view.focus()
//
// Which branches are open is remembered in localStorage, per browser.
import { treeAction } from "./tree-keys.js";

const STORE_KEY = "paradigm.tree.expanded";

export class TreeView {
  constructor(root, { onOpen, onLeave }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.tree = null;
    this.current = null;
    this.currentParent = null;
    this.active = null;
    this.expanded = loadExpanded();
    root.setAttribute("role", "tree");
    root.addEventListener("keydown", (event) => this.onKeyDown(event));
    root.addEventListener("click", (event) => this.onClick(event));
    root.addEventListener("focusin", (event) => {
      const item = event.target.closest?.("[role=treeitem]");
      if (item) this.active = Number(item.dataset.id);
    });
  }

  show(tree, currentId) {
    this.tree = tree;
    // A note just opened, or the open note moved: show where it is now.
    const parent = tree.parentId(currentId);
    if (currentId !== this.current || parent !== this.currentParent) {
      for (const id of tree.ancestors(currentId)) this.expanded.add(id);
      this.active = currentId;
    }
    this.current = currentId;
    this.currentParent = parent;
    if (!tree.has(this.active)) this.active = currentId;
    const hadFocus = this.root.contains(document.activeElement);
    this.root.replaceChildren(...tree.children(null).map((note) => this.item(note, 1)));
    if (hadFocus) this.focus();
  }

  item(note, level) {
    const kids = this.tree.children(note.id);
    const open = kids.length > 0 && this.expanded.has(note.id);
    const li = document.createElement("li");
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-level", String(level));
    li.setAttribute("aria-selected", String(note.id === this.current));
    li.tabIndex = note.id === this.active ? 0 : -1;
    li.dataset.id = String(note.id);
    li.className = "tree__item";
    if (kids.length) li.setAttribute("aria-expanded", String(open));
    const row = document.createElement("div");
    row.className = "tree__row";
    const twisty = document.createElement("span");
    twisty.className = "tree__twisty";
    twisty.setAttribute("aria-hidden", "true");
    twisty.textContent = kids.length ? (open ? "▾" : "▸") : "";
    const title = document.createElement("span");
    title.className = "tree__title";
    title.textContent = note.title;
    row.append(twisty, title);
    li.append(row);
    if (open) {
      const group = document.createElement("ul");
      group.setAttribute("role", "group");
      group.className = "tree__group";
      group.append(...kids.map((kid) => this.item(kid, level + 1)));
      li.append(group);
    }
    return li;
  }

  focus() {
    const item = this.itemNode(this.active) ?? this.root.querySelector("[role=treeitem]");
    item?.focus();
  }

  itemNode(id) {
    return this.root.querySelector(`[role=treeitem][data-id="${Number(id)}"]`);
  }

  /** The notes as shown, top to bottom (collapsed branches skipped). */
  visible() {
    const out = [];
    const walk = (parent) => {
      for (const note of this.tree.children(parent)) {
        out.push(note.id);
        if (this.expanded.has(note.id)) walk(note.id);
      }
    };
    walk(null);
    return out;
  }

  onClick(event) {
    const item = event.target.closest?.("[role=treeitem]");
    if (!item) return;
    const id = Number(item.dataset.id);
    if (event.target.closest(".tree__twisty") && this.tree.children(id).length) {
      this.setExpanded(id, !this.expanded.has(id));
      return;
    }
    this.onOpen(id);
  }

  onKeyDown(event) {
    const action = treeAction(event);
    if (!action || this.active === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.perform(action);
  }

  perform(action) {
    const id = this.active;
    const shown = this.visible();
    const at = shown.indexOf(id);
    const kids = this.tree.children(id);
    switch (action) {
      case "next": return this.moveTo(shown[Math.min(at + 1, shown.length - 1)]);
      case "previous": return this.moveTo(shown[Math.max(at - 1, 0)]);
      case "first": return this.moveTo(shown[0]);
      case "last": return this.moveTo(shown[shown.length - 1]);
      case "expand":
        if (!kids.length) return;
        return this.expanded.has(id) ? this.moveTo(kids[0].id) : this.setExpanded(id, true);
      case "collapse":
        if (kids.length && this.expanded.has(id)) return this.setExpanded(id, false);
        return this.moveTo(this.tree.parentId(id) ?? id);
      case "open": return this.onOpen(id);
      case "editor": return this.onLeave();
    }
  }

  moveTo(id) {
    if (id === undefined || id === null) return;
    this.active = id;
    for (const node of this.root.querySelectorAll("[role=treeitem]")) node.tabIndex = Number(node.dataset.id) === id ? 0 : -1;
    this.itemNode(id)?.focus();
  }

  setExpanded(id, open) {
    if (open) this.expanded.add(id);
    else this.expanded.delete(id);
    saveExpanded(this.expanded);
    const hadFocus = this.root.contains(document.activeElement);
    this.root.replaceChildren(...this.tree.children(null).map((note) => this.item(note, 1)));
    if (hadFocus) this.focus();
  }
}

function loadExpanded() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter(Number.isInteger) : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(ids) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage full or off: the tree just forgets which branches were open.
  }
}
