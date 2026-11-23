// A list page drawn in place of the note (People, Meetings): a heading with a count, filter
// dropdowns, a search box and the list. It draws what its page tells it and reports which
// row to open; the app shows and hides it.
//
//   const page = new ListPage(section, {
//     name: "people",                      class list-page--people on the section
//     heading: "People",
//     filters: [{ key, label, any: "any" }],  dropdowns; values are strings, "" is any
//     search: { key, label, placeholder },  the text box ("/" reaches it)
//     options(ctx) -> { [filter key]: [[value, text]] }
//     rows(ctx, filters) -> [{ id, ... }]   what matches, in the order shown
//     cells(row, ctx) -> [[className, text]]
//     columns: ["Name", ...]               optional: a heading over each cell's column
//     empty: "No one matches",
//     add: { label: "New person", run() },  optional: a button in the bar (and the a key)
//     pills: { key, choices(ctx) -> [[value, text]] }   optional: quick filters as pills, one
//                                          on (the first unless chosen); the value is in filters
//     groupOf(row) -> { key, label, className? }   optional: rows under day (or other)
//                                          headings; } and { jump between them
//     onAction(action, filters) -> true    optional: a page key the list doesn't know (the
//                                          Meetings page's p); true: draw again
//     onOpen(id), onLeave() });
//   page.show(ctx)    draw (again) with the filters as they are
//   page.focus()      the list
//   page.say(text)    a line under the bar, since the editor's status line is hidden here
//                     (cleared on the next draw)
//
// The list is one focus stop (a listbox with aria-activedescendant, as on the hub panel);
// the filters are ordinary form fields, so Tab goes through them like on any web page.
import { pageAction } from "./page-keys.js";

export class ListPage {
  constructor(section, spec) {
    this.section = section;
    this.spec = spec;
    this.ctx = null;
    this.values = Object.fromEntries([...spec.filters.map((f) => [f.key, ""]), [spec.search.key, ""],
      ...(spec.pills ? [[spec.pills.key, ""]] : [])]);
    this.rows = [];
    this.active = 0;
    section.classList.add("list-page", `list-page--${spec.name}`);
    this.count = element("span", "list-page__count");
    const heading = element("h2", "list-page__heading", `${spec.heading} `);
    heading.append(this.count);
    this.selects = new Map(spec.filters.map((filter) => [filter.key, this.select(filter)]));
    this.searchBox = element("input", "list-page__search");
    Object.assign(this.searchBox, { type: "search", placeholder: spec.search.placeholder, autocomplete: "off" });
    this.searchBox.addEventListener("input", () => this.setFilter(spec.search.key, this.searchBox.value));
    this.searchBox.addEventListener("keydown", (event) => this.onSearchKey(event));
    const filters = element("div", "list-page__filters");
    filters.append(...[...this.selects.values()].map((s) => s.closest("label")), labelled(spec.search.label, this.searchBox));
    this.list = element("ul", "list-page__list");
    this.list.id = `${spec.name}-list`;
    this.list.tabIndex = 0;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", spec.heading);
    this.list.addEventListener("keydown", (event) => this.onListKey(event));
    this.list.addEventListener("click", (event) => {
      const row = event.target.closest?.("[role=option]");
      if (row) this.openRow(Number(row.dataset.index));
    });
    const bar = element("div", "list-page__bar");
    bar.append(heading);
    if (spec.pills) {
      this.pills = element("div", "list-page__pills");
      this.pills.setAttribute("role", "group");
      this.pills.setAttribute("aria-label", "Show");
      bar.append(this.pills);
    }
    bar.append(filters);
    if (spec.add) {
      const add = element("button", "list-page__add", `+ ${spec.add.label}`);
      add.type = "button";
      add.title = `${spec.add.label} (a)`;
      add.addEventListener("click", () => spec.add.run());
      bar.append(add);
    }
    this.message = element("p", "list-page__message");
    this.message.setAttribute("role", "status");
    this.message.hidden = true;
    // The column headings: the same grid as the rows, outside the listbox (the keys skip it).
    const head = spec.columns ? element("div", "list-page__row list-page__head") : null;
    if (head) {
      head.setAttribute("aria-hidden", "true");
      head.append(...spec.columns.map((text, index) => element("span", "list-page__cell", text)));
    }
    section.replaceChildren(...[bar, this.message, head, this.list].filter(Boolean));
  }

  say(text) {
    this.message.textContent = text;
    this.message.hidden = !text;
  }

  select({ key, label }) {
    const select = element("select", "list-page__filter");
    select.dataset.filter = key;
    select.addEventListener("change", () => this.setFilter(key, select.value));
    labelled(label, select);
    return select;
  }

  show(ctx) {
    this.ctx = ctx;
    this.say("");
    const activeId = this.rows[this.active]?.id;
    this.fillOptions();
    this.drawPills();
    this.rows = this.spec.rows(ctx, this.values);
    this.active = Math.max(0, this.rows.findIndex((row) => row.id === activeId));
    this.draw();
  }

  fillOptions() {
    const choices = this.spec.options(this.ctx);
    for (const { key, any = "any" } of this.spec.filters) {
      const select = this.selects.get(key);
      const options = [["", any], ...(choices[key] ?? [])];
      // A value no one has any more (a role renamed in another tab): back to "any".
      if (!options.some(([value]) => value === this.values[key])) this.values[key] = "";
      select.replaceChildren(...options.map(([value, text]) => {
        const option = element("option", "", text);
        option.value = value;
        return option;
      }));
      select.value = this.values[key];
    }
  }

  drawPills() {
    if (!this.spec.pills) return;
    const { key, choices } = this.spec.pills;
    const list = choices(this.ctx, this.values);
    if (!list.some(([value]) => value === this.values[key])) this.values[key] = list[0]?.[0] ?? "";
    this.pills.replaceChildren(...list.map(([value, text]) => {
      const pill = element("button", "list-page__pill", text);
      pill.type = "button";
      pill.setAttribute("aria-pressed", String(value === this.values[key]));
      pill.addEventListener("click", () => {
        this.setFilter(key, value);
        this.drawPills();
      });
      return pill;
    }));
  }

  setFilter(key, value) {
    if (key) this.values[key] = value;
    this.rows = this.spec.rows(this.ctx, this.values);
    this.active = 0;
    this.draw();
  }

  draw() {
    const total = this.rows.length;
    this.count.textContent = `· ${total}`;
    const nodes = [];
    let group = null;
    this.rows.forEach((row, index) => {
      const heading = this.spec.groupOf?.(row);
      if (heading && heading.key !== group) {
        group = heading.key;
        const li = element("li", `list-page__group ${heading.className ?? ""}`.trim(), heading.label);
        li.setAttribute("role", "presentation");
        nodes.push(li);
      }
      nodes.push(this.row(row, index));
    });
    this.list.replaceChildren(...(total ? nodes : [element("li", "list-page__empty", this.spec.empty)]));
    this.markActive();
  }

  row(row, index) {
    const li = element("li", "list-page__row");
    li.id = `${this.spec.name}-row-${index}`;
    li.dataset.index = String(index);
    li.setAttribute("role", "option");
    li.append(...this.spec.cells(row, this.ctx).map(([className, text]) => element("span", `list-page__cell ${className}`, text)));
    return li;
  }

  markActive() {
    const rows = this.list.querySelectorAll("[role=option]");
    rows.forEach((row, index) => row.setAttribute("aria-selected", String(index === this.active)));
    const row = rows[this.active];
    if (row) {
      this.list.setAttribute("aria-activedescendant", row.id);
      row.scrollIntoView?.({ block: "nearest" });
    } else {
      this.list.removeAttribute("aria-activedescendant");
    }
  }

  onListKey(event) {
    const action = pageAction(event, "list");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const last = this.rows.length - 1;
    switch (action) {
      case "next": return this.moveTo(Math.min(this.active + 1, last));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "first": return this.moveTo(0);
      case "last": return this.moveTo(last);
      case "open": return this.openRow(this.active);
      case "search": return this.searchBox.focus();
      case "add": return this.spec.add?.run();
      case "leave": return this.spec.onLeave();
      case "nextGroup": return this.moveTo(this.groupStart(1));
      case "previousGroup": return this.moveTo(this.groupStart(-1));
      case "pending": return undefined;
      default:
        if (this.spec.onAction?.(action, this.values)) this.setFilter("", undefined);
        return undefined;
    }
  }

  /** The first row of the next (1) or previous (-1) group; its own group's first going back. */
  groupStart(direction) {
    if (!this.spec.groupOf) return this.active;
    const keys = this.rows.map((row) => this.spec.groupOf(row).key);
    const starts = keys.map((key, index) => index).filter((index) => index === 0 || keys[index - 1] !== keys[index]);
    if (direction > 0) return starts.find((index) => index > this.active) ?? this.active;
    return starts.filter((index) => index < this.active).pop() ?? this.active;
  }

  onSearchKey(event) {
    if (pageAction(event, "search") !== "list") return;
    event.preventDefault();
    event.stopPropagation();
    this.focus();
  }

  moveTo(index) {
    if (index < 0) return;
    this.active = index;
    this.markActive();
  }

  openRow(index) {
    const row = this.rows[index];
    if (row) this.spec.onOpen(row.id);
  }

  focus() {
    this.list.focus();
  }
}

function labelled(text, field) {
  const label = element("label", "list-page__label");
  label.append(element("span", "list-page__label-text", text), field);
  return label;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
