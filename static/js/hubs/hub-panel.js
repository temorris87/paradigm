// The sections under a hub's text: each a heading (label, count, add button) and its rows,
// folded or not, with "Show all (12)" past a section's limit. Sections with nothing in them
// share one quiet line at the foot of their lane. It draws what it is given and reports what
// the user asked for; HubPage decides the rest.
//
//   const panel = new HubPanel(sectionElement, { onRow(section, row), onToggle(section),
//     onExpand(section, row), onMore(section), onAdd(section), onRowAction(section, row, key),
//     onCommand(action), onLeave(), renderSnippet(markdown) -> html });
//     onExpand: z (or a click on its ▸) on a row that opens in place (row.expanded set)
//   panel.draw(sections)            one lane (the note window)
//   panel.draw({ wide, act, know })  two lanes side by side (the main window's dashboard),
//                                   under the wide sections (full width)
//     each section: { key, label, detail, folded, rows, empty, add, addPlain, more, columns? }
//     add: the button's label or null (addPlain: without the "+"); more: how many rows
//     "Show all" would add (0: none);
//     columns: a table's column names (its rows carry cells)
//   panel.focus()
//   panel.reset()                  another note: the next draws start on its first task again
//
// The whole panel is one focus stop (Tab passes through it once): a listbox whose options are
// the headings, the rows and the "Show all" lines, the active one shown with
// aria-activedescendant. The buttons are for the mouse (tabIndex -1); the keys do the same
// (hub-keys.js).
import { hubAction } from "./hub-keys.js";

const MAX_DEPTH = 6;
const KEYS_OF = { remove: "x", role: "r", answer: "r", done: "Space", edit: "e", delegate: "d", takeBack: "d", history: "h" };

export class HubPanel {
  constructor(section, handlers) {
    this.section = section;
    this.handlers = handlers;
    this.sections = [];
    this.options = []; // [{ id, type: "heading" | "row" | "more", section, row? }]
    this.active = 0;
    // Until the user moves or acts, each draw selects the first task: the tasks may arrive
    // after the first draw, which would otherwise leave the heading selected for good.
    this.touched = false;
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

  draw(layout) {
    const hadFocus = this.hasFocus();
    const activeId = this.options[this.active]?.id;
    const lanes = Array.isArray(layout) ? [{ key: "page", label: "Sections", sections: layout }]
      : [...(layout.wide?.length ? [{ key: "wide", label: "Overview", sections: layout.wide }] : []),
        { key: "act", label: "To act on", sections: layout.act }, { key: "know", label: "To look up", sections: layout.know }];
    this.sections = lanes.flatMap((lane) => lane.sections);
    this.options = [];
    this.list.classList.toggle("hub__list--lanes", lanes.length > 1);
    this.list.replaceChildren(...lanes.map((lane, index) => this.lane(lane, index)));
    const again = this.options.findIndex((option) => option.id === activeId);
    // Untouched, the panel starts on the first task, the row most likely acted on.
    const first = this.touched ? -1
      : this.options.findIndex((option) => option.row?.task !== undefined && !option.row.addSubtask);
    this.active = Math.max(0, first >= 0 ? first : again);
    this.markActive();
    if (hadFocus) this.focus();
  }

  lane(lane, index) {
    const node = element("div", `hub__lane hub__lane--${lane.key}`);
    node.setAttribute("role", "group");
    node.setAttribute("aria-label", lane.label);
    this.laneIndex = index;
    // Empty, folded or not, a section is only a name on the lane's Nothing yet line.
    const empty = lane.sections.filter((section) => !section.rows.length);
    node.append(...lane.sections.filter((section) => !empty.includes(section)).map((section) => this.group(section)));
    if (empty.length) node.append(this.empties(empty));
    return node;
  }

  /** "Nothing yet: Open questions + · Files + · Past meetings": the lane's empty sections on one line. */
  empties(sections) {
    const line = element("div", "hub__empties");
    line.append(element("span", "hub__empties-label", "Nothing yet:"));
    sections.forEach((section, index) => {
      if (index) line.append(element("span", "hub__empties-separator", "·"));
      const item = this.option(element("span", "hub__empty-item"), { type: "empty", section });
      item.title = section.empty;
      item.append(element("span", "hub__empty-label", section.label));
      if (section.add) item.append(button("hub__empty-add", "+", `${section.add} (a)`, "add"));
      line.append(item);
    });
    return line;
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
    if (section.add) heading.append(button("hub__add", section.addPlain ? section.add : `+ ${section.add}`, `${section.add} (a)`, "add"));
    group.append(heading);
    if (section.folded) return group;
    if (!section.rows.length) {
      group.classList.add("hub__section--empty");
      const empty = element("div", "hub__empty", section.empty);
      group.append(empty);
    }
    if (section.columns && section.rows.length) group.classList.add("hub__section--table");
    if (section.columns && section.rows.length) {
      const head = element("div", "hub__columns");
      head.setAttribute("aria-hidden", "true");
      head.append(element("span", "hub__column hub__column--title", "Name"),
        ...section.columns.map((name) => element("span", "hub__column", name)));
      group.append(head);
    }
    for (const row of section.rows) group.append(this.row(section, row));
    if (section.more) {
      group.append(this.option(element("div", "hub__more", `Show all (${section.total ?? section.rows.length + section.more})`),
        { type: "more", section }));
    }
    return group;
  }

  row(section, row) {
    const classes = ["hub__row", `hub__row--depth-${Math.min(row.depth ?? 0, MAX_DEPTH)}`, row.muted && "hub__row--muted",
      row.late && "hub__row--late", row.addSubtask && "hub__row--add", row.date && "hub__row--dated", row.box && "hub__row--box",
      row.health && `hub__row--health health--${row.health}`, row.statusHistory && "hub__row--add", row.bar && "hub__row--bar",
      row.pre !== undefined && "hub__row--pre",
      (row.task !== undefined || row.addSubtask !== undefined) && "hub__row--task"];
    const node = this.option(element("div", classes.filter(Boolean).join(" ")), { type: "row", section, row });
    if (row.tip) node.title = row.tip;
    const line = element("div", "hub__line");
    if (row.task !== undefined && row.depth === 0 && !row.addSubtask) {
      const twisty = element("span", "hub__twisty hub__twisty--task", row.expanded ? "▾" : "▸");
      if (row.expanded !== undefined) {
        twisty.dataset.action = "expand";
        twisty.title = row.expanded ? "Close it (z)" : "Its notes and subtasks here (z)";
      }
      line.append(twisty);
    }
    if (row.task !== undefined && !row.addSubtask) line.append(element("span", "hub__box", row.done ? "☑" : "☐"));
    if (row.pre !== undefined) {
      node.append(element("pre", "hub__pre", row.pre));
      return node;
    }
    line.append(element("span", "hub__title", row.title));
    if (row.bar) line.append(barOf(row.bar));
    if (section.columns && row.cells) {
      line.append(...row.cells.map((cell, index) => element("span", `hub__cell ${row.cellClasses?.[index] ?? ""}`.trim(), cell)));
    } else line.append(element("span", "hub__detail", row.detail ?? ""));
    // The date sits in a column of its own at the end, so a section's dates line up.
    if (!section.columns) line.append(element("span", "hub__date", row.date ?? ""));
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
    const rowId = option.row ? `${option.row.id}:${option.row.at?.line ?? ""}:${option.row.task ?? option.row.file ?? (option.row.folder !== undefined ? `folder${option.row.folder}` : undefined) ?? option.row.template ?? option.row.addSubtask ?? ""}` : "";
    this.options.push({ ...option, lane: this.laneIndex ?? 0, id: `${option.type}:${option.section.key}:${rowId}` });
    node.id = `hub-option-${index}`;
    node.dataset.index = String(index);
    node.setAttribute("role", "option");
    return node;
  }

  onClick(event) {
    const node = event.target.closest?.("[role=option]");
    if (!node) return;
    this.touched = true;
    // A link inside a snippet opens the row, like a click anywhere on it.
    if (event.target.closest("a")) event.preventDefault();
    const index = Number(node.dataset.index);
    this.active = index;
    this.markActive();
    this.focus();
    const action = event.target.closest("[data-action]")?.dataset.action;
    const option = this.options[index];
    if (action === "add") return this.handlers.onAdd(option.section);
    if (action === "expand") return this.handlers.onExpand?.(option.section, option.row);
    if (action) return this.handlers.onRowAction(option.section, option.row, action);
    return this.activate(option);
  }

  activate(option) {
    if (!option) return undefined;
    if (option.type === "heading") return this.handlers.onToggle(option.section);
    if (option.type === "empty") return option.section.add ? this.handlers.onAdd(option.section) : undefined;
    if (option.type === "more") return this.handlers.onMore(option.section);
    return this.handlers.onRow(option.section, option.row);
  }

  perform(action) {
    this.touched = true;
    const option = this.options[this.active];
    const last = this.options.length - 1;
    switch (action) {
      case "next": return this.moveTo(Math.min(this.active + 1, last));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "first": return this.moveTo(0);
      case "last": return this.moveTo(last);
      case "nextSection": return this.moveTo(this.headingIndex(1));
      case "previousSection": return this.moveTo(this.headingIndex(-1));
      case "nextLane": return this.moveTo(this.laneTarget(1));
      case "previousLane": return this.moveTo(this.laneTarget(-1));
      case "open": return this.activate(option);
      case "fold": return this.fold(option);
      case "add": return option?.section.add ? this.handlers.onAdd(option.section) : undefined;
      case "remove": return this.rowAction(option, ["remove"]);
      case "second": return this.rowAction(option, ["role", "answer"]);
      case "toggle": return this.rowAction(option, ["done"]);
      case "edit": return this.rowAction(option, ["edit"]);
      case "delegate": return this.rowAction(option, ["delegate", "takeBack"]);
      case "history": return this.rowAction(option, ["history"]);
      case "logStatus":
      case "plan": return this.handlers.onCommand?.(action);
      case "editor": return this.handlers.onLeave();
      default: return undefined;
    }
  }

  /** z: a task row that opens in place opens or closes; anywhere else, the section folds. */
  fold(option) {
    if (!option || option.type === "empty") return undefined;
    if (option.type === "row" && option.row.expanded !== undefined) return this.handlers.onExpand?.(option.section, option.row);
    return this.handlers.onToggle(option.section);
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

  /** The option in the next (1) or previous (-1) lane nearest the active one's height. */
  laneTarget(direction) {
    const from = this.options[this.active];
    if (!from) return this.active;
    const lane = from.lane + direction;
    const nodes = [...this.list.querySelectorAll("[role=option]")];
    const top = nodes[this.active]?.getBoundingClientRect().top ?? 0;
    let best = -1;
    let distance = Infinity;
    this.options.forEach((option, index) => {
      if (option.lane !== lane) return;
      const away = Math.abs((nodes[index]?.getBoundingClientRect().top ?? 0) - top);
      if (away < distance) [best, distance] = [index, away];
    });
    return best >= 0 ? best : this.active;
  }

  moveTo(index) {
    if (index < 0) return;
    this.active = index;
    this.markActive();
  }

  /** Puts the cursor on a note's row in the Notes section, if it is listed there (open). */
  selectNote(id) {
    const index = this.options.findIndex((option) => option.type === "row" && option.section.key === "notes" && option.row.id === id);
    if (index < 0) return false;
    // Touched: the next draw keeps this row rather than going back to the first task.
    this.touched = true;
    this.moveTo(index);
    return true;
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

  reset() {
    this.touched = false;
    this.options = [];
    this.active = 0;
  }

  hasFocus() {
    return this.section.contains(document.activeElement);
  }
}

/** A Portfolio bar: where the project's plan sits in the span of them all, and today. */
function barOf({ left, width, today }) {
  const track = element("span", "hub__bar");
  const fill = element("span", "hub__bar-fill");
  // Inline style="" is refused by the CSP; CSSOM properties are not.
  fill.style.setProperty("--left", String(left));
  fill.style.setProperty("--width", String(width));
  track.append(fill);
  if (today !== undefined && today >= 0 && today <= 1) {
    const now = element("span", "hub__bar-today");
    now.style.setProperty("--at", String(today));
    track.append(now);
  }
  return track;
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
