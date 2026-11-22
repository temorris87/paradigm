// The sections under a hub's text: each a heading (label, count, add button) and its rows,
// folded or not, with "Show all (12)" past a section's limit. It draws what it is given and
// reports what the user asked for; HubPage decides the rest.
//
//   const panel = new HubPanel(sectionElement, { onRow(section, row), onToggle(section),
//     onMore(section), onAdd(section), onRowAction(section, row, key), onLeave(),
//     renderSnippet(markdown) -> html });
//   panel.draw([{ key, label, detail, folded, rows, empty, add, more }])
//     add: the button's label or null; more: how many rows "Show all" would add (0: none)
//   panel.focus()
//
// The whole panel is one focus stop (Tab passes through it once): a listbox whose options are
// the headings, the rows and the "Show all" lines, the active one shown with
// aria-activedescendant. The buttons are for the mouse (tabIndex -1); the keys do the same
// (hub-keys.js).
import { hubAction } from "./hub-keys.js";

const MAX_DEPTH = 6;
const KEYS_OF = { remove: "x", role: "r", answer: "r", done: "Space" };

export class HubPanel {
  constructor(section, handlers) {
    this.section = section;
    this.handlers = handlers;
    this.sections = [];
    this.options = []; // [{ id, type: "heading" | "row" | "more", section, row? }]
    this.active = 0;
    this.list = element("div", "hub__list");
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Sections");
    this.list.tabIndex = 0;
    this.list.id = "hub-list";
    section.replaceChildren(this.list);
    this.list.addEventListener("keydown", (event) => {
      const action = hubAction(event);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      this.perform(action);
    });
    this.list.addEventListener("click", (event) => this.onClick(event));
  }

  draw(sections) {
    const hadFocus = this.hasFocus();
    const activeId = this.options[this.active]?.id;
    this.sections = sections;
    this.options = [];
    this.list.replaceChildren(...sections.map((section) => this.group(section)));
    const again = this.options.findIndex((option) => option.id === activeId);
    this.active = Math.max(0, again);
    this.markActive();
    if (hadFocus) this.focus();
  }

  group(section) {
    const group = element("div", `hub__section hub__section--${section.key}`);
    group.setAttribute("role", "group");
    const heading = this.option(element("div", "hub__heading"), { type: "heading", section });
    heading.setAttribute("aria-expanded", String(!section.folded));
    const label = element("span", "hub__label", section.label);
    label.id = `hub-heading-${section.key}`;
    group.setAttribute("aria-labelledby", label.id);
    heading.append(element("span", "hub__twisty", section.folded ? "▸" : "▾"), label,
      element("span", "hub__count", section.detail));
    if (section.add) heading.append(button("hub__add", `+ ${section.add}`, `${section.add} (a)`, "add"));
    group.append(heading);
    if (section.folded) return group;
    if (!section.rows.length) {
      const empty = element("div", "hub__empty", section.empty);
      group.append(empty);
    }
    for (const row of section.rows) group.append(this.row(section, row));
    if (section.more) {
      group.append(this.option(element("div", "hub__more", `Show all (${section.rows.length + section.more})`),
        { type: "more", section }));
    }
    return group;
  }

  row(section, row) {
    const classes = ["hub__row", `hub__row--depth-${Math.min(row.depth ?? 0, MAX_DEPTH)}`, row.muted && "hub__row--muted"];
    const node = this.option(element("div", classes.filter(Boolean).join(" ")), { type: "row", section, row });
    const line = element("div", "hub__line");
    line.append(element("span", "hub__title", row.title), element("span", "hub__detail", row.detail ?? ""));
    if (row.actions?.length) {
      const box = element("span", "hub__row-actions");
      for (const { key, label } of row.actions) box.append(button("hub__row-action", label, `${label} (${KEYS_OF[key] ?? ""})`, key));
      line.append(box);
    }
    node.append(line);
    if (row.snippet) {
      const snippet = element("div", "hub__snippet md-doc");
      snippet.innerHTML = this.handlers.renderSnippet?.(row.snippet) ?? "";
      for (const link of snippet.querySelectorAll("a")) link.tabIndex = -1;
      node.append(snippet);
    }
    return node;
  }

  option(node, option) {
    const index = this.options.length;
    const rowId = option.row ? `${option.row.id}:${option.row.at?.line ?? ""}` : "";
    this.options.push({ ...option, id: `${option.type}:${option.section.key}:${rowId}` });
    node.id = `hub-option-${index}`;
    node.dataset.index = String(index);
    node.setAttribute("role", "option");
    return node;
  }

  onClick(event) {
    const node = event.target.closest?.("[role=option]");
    if (!node) return;
    // A link inside a snippet opens the row, like a click anywhere on it.
    if (event.target.closest("a")) event.preventDefault();
    const index = Number(node.dataset.index);
    this.active = index;
    this.markActive();
    this.focus();
    const action = event.target.closest("[data-action]")?.dataset.action;
    const option = this.options[index];
    if (action === "add") return this.handlers.onAdd(option.section);
    if (action) return this.handlers.onRowAction(option.section, option.row, action);
    return this.activate(option);
  }

  activate(option) {
    if (!option) return undefined;
    if (option.type === "heading") return this.handlers.onToggle(option.section);
    if (option.type === "more") return this.handlers.onMore(option.section);
    return this.handlers.onRow(option.section, option.row);
  }

  perform(action) {
    const option = this.options[this.active];
    const last = this.options.length - 1;
    switch (action) {
      case "next": return this.moveTo(Math.min(this.active + 1, last));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "first": return this.moveTo(0);
      case "last": return this.moveTo(last);
      case "nextSection": return this.moveTo(this.headingIndex(1));
      case "previousSection": return this.moveTo(this.headingIndex(-1));
      case "open": return this.activate(option);
      case "fold": return option && this.handlers.onToggle(option.section);
      case "add": return option?.section.add ? this.handlers.onAdd(option.section) : undefined;
      case "remove": return this.rowAction(option, ["remove"]);
      case "second": return this.rowAction(option, ["role", "answer"]);
      case "toggle": return this.rowAction(option, ["done"]);
      case "editor": return this.handlers.onLeave();
      default: return undefined;
    }
  }

  rowAction(option, keys) {
    const action = option?.row?.actions?.find((each) => keys.includes(each.key));
    if (action) this.handlers.onRowAction(option.section, option.row, action.key);
  }

  /** The next (1) or previous (-1) heading; going back from inside a section first goes to
   * its own heading, as { does in Vim. */
  headingIndex(direction) {
    const headings = this.options.map((option, index) => (option.type === "heading" ? index : -1)).filter((index) => index >= 0);
    if (direction > 0) return headings.find((index) => index > this.active) ?? this.active;
    return headings.filter((index) => index < this.active).pop() ?? this.active;
  }

  moveTo(index) {
    if (index < 0) return;
    this.active = index;
    this.markActive();
  }

  markActive() {
    const nodes = this.list.querySelectorAll("[role=option]");
    nodes.forEach((node, index) => node.setAttribute("aria-selected", String(index === this.active)));
    const node = nodes[this.active];
    if (node) {
      this.list.setAttribute("aria-activedescendant", node.id);
      node.scrollIntoView?.({ block: "nearest" });
    } else {
      this.list.removeAttribute("aria-activedescendant");
    }
  }

  focus() {
    this.list.focus();
  }

  hasFocus() {
    return this.section.contains(document.activeElement);
  }
}

function button(className, text, title, action) {
  const node = element("button", className, text);
  Object.assign(node, { type: "button", tabIndex: -1, title });
  node.dataset.action = action;
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
