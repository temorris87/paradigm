// The hub page's section panel: a row of tabs, size buttons, and the open tab's list. It
// draws what it is given and reports what the user asked for; HubPage decides the rest.
//
//   const panel = new HubPanel(sectionElement, { onAction(action, event), onTab(index),
//                                                onRow(index), onSize(size) });
//   panel.draw({ tabs, tabIndex, rows, empty, active, size })
//   panel.focus()            the one focus stop: the list, or the tab row when collapsed
//
// Only one element in the panel takes the focus (Tab passes through it once); the active
// row is shown with aria-activedescendant, as a listbox does.
import { hubAction } from "./hub-keys.js";

const SIZE_BUTTONS = [
  { size: "collapsed", text: "▾", label: "Collapse the panel (-)" },
  { size: "open", text: "▴", label: "Open the panel under the note" },
  { size: "expanded", text: "⤢", label: "Expand the panel over the note (+)" },
];
const MAX_DEPTH = 6;

export class HubPanel {
  constructor(section, { onAction, onTab, onRow, onSize }) {
    this.section = section;
    this.tabList = element("div", "hub__tabs");
    this.tabList.setAttribute("role", "tablist");
    this.tabList.setAttribute("aria-label", "Sections");
    this.sizes = element("div", "hub__sizes");
    this.list = element("ul", "hub__list");
    this.list.setAttribute("role", "listbox");
    this.list.id = "hub-list";
    this.rowCount = 0;
    const bar = element("div", "hub__bar");
    bar.append(this.tabList, this.sizes);
    section.replaceChildren(bar, this.list);
    for (const { size, text, label } of SIZE_BUTTONS) {
      const button = element("button", "hub__size");
      Object.assign(button, { type: "button", tabIndex: -1, textContent: text, title: label });
      button.dataset.size = size;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", () => onSize(size));
      this.sizes.append(button);
    }
    section.addEventListener("keydown", (event) => {
      const action = hubAction(event);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      onAction(action, event);
    });
    this.tabList.addEventListener("click", (event) => {
      const tab = event.target.closest?.("[role=tab]");
      if (tab) onTab(Number(tab.dataset.index));
    });
    this.list.addEventListener("click", (event) => {
      const row = event.target.closest?.("[role=option]");
      if (row) onRow(Number(row.dataset.index));
    });
  }

  draw({ tabs, tabIndex, rows, empty, active, size }) {
    const hadFocus = this.section.contains(document.activeElement);
    this.section.dataset.size = size;
    for (const button of this.sizes.children) button.setAttribute("aria-pressed", String(button.dataset.size === size));
    this.rowCount = rows.length;
    this.tabList.replaceChildren(...tabs.map((tab, index) => this.tab(tab, index, index === tabIndex)));
    this.list.hidden = size === "collapsed";
    this.list.setAttribute("aria-labelledby", `hub-tab-${tabIndex}`);
    this.list.replaceChildren(...(rows.length ? rows.map((row, index) => this.row(row, index)) : [this.emptyRow(empty)]));
    // One focus stop: the list while it shows, else the tab row (so - and + still work).
    this.list.tabIndex = size === "collapsed" ? -1 : 0;
    this.tabList.tabIndex = size === "collapsed" ? 0 : -1;
    this.markActive(active);
    if (hadFocus) this.focus();
  }

  tab({ label }, index, selected) {
    const tab = element("button", "hub__tab");
    tab.type = "button";
    tab.id = `hub-tab-${index}`;
    tab.tabIndex = -1;
    tab.dataset.index = String(index);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(selected));
    tab.setAttribute("aria-controls", "hub-list");
    tab.title = `${label} (${index + 1})`;
    tab.textContent = label;
    return tab;
  }

  row({ title, depth, detail, muted }, index) {
    const li = element("li", `hub__row hub__row--depth-${Math.min(depth, MAX_DEPTH)}${muted ? " hub__row--muted" : ""}`);
    li.id = `hub-row-${index}`;
    li.dataset.index = String(index);
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.append(element("span", "hub__title", title), element("span", "hub__detail", detail));
    return li;
  }

  emptyRow(text) {
    return element("li", "hub__empty", text);
  }

  markActive(active) {
    const rows = this.list.querySelectorAll("[role=option]");
    rows.forEach((row, index) => row.setAttribute("aria-selected", String(index === active)));
    const row = rows[active];
    if (row) {
      this.list.setAttribute("aria-activedescendant", row.id);
      row.scrollIntoView?.({ block: "nearest" });
    } else {
      this.list.removeAttribute("aria-activedescendant");
    }
  }

  focus() {
    (this.list.hidden ? this.tabList : this.list).focus();
  }

  hasFocus() {
    return this.section.contains(document.activeElement);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
