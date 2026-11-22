// The Home page, drawn in place of the note: the sections of THE Home section table
// (home-sections.js), each a heading with its rows. It draws and reports which note to open;
// the app shows and hides it (static/js/notes/page-views.js).
//
//   const page = new HomePage(section, { onOpen(id), onLeave(), today? });
//   page.show(ctx); page.focus();
//
// The whole page is one focus stop: a listbox whose groups are the sections, the active row
// shown with aria-activedescendant. Rows without a note (the "No area" heading) are skipped.
// today() is asked on each draw, so "Today" moves on with the clock.
import { homeAction } from "./home-keys.js";
import { homeSections } from "./home-sections.js";

export class HomePage {
  constructor(section, { onOpen, onLeave, today = () => new Date() }) {
    this.section = section;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.today = today;
    this.options = [];     // [{ id, sectionIndex }], the rows the keys move over, in order
    this.active = 0;
    section.classList.add("home");
    this.list = element("div", "home__list");
    this.list.id = "home-list";
    this.list.tabIndex = 0;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Home");
    this.list.addEventListener("keydown", (event) => this.onKey(event));
    this.list.addEventListener("click", (event) => {
      const row = event.target.closest?.("[role=option]");
      if (row) this.open(Number(row.dataset.index));
    });
    section.replaceChildren(this.list);
  }

  show(ctx) {
    const activeId = this.options[this.active]?.id;
    const sections = homeSections(ctx, this.today());
    this.options = [];
    this.list.replaceChildren(...sections.map((each, index) => this.group(each, index)));
    this.active = Math.max(0, this.options.findIndex((option) => option.id === activeId));
    this.markActive();
  }

  group({ key, heading, detail, rows, empty }, sectionIndex) {
    const group = element("div", `home__section home__section--${key}`);
    group.setAttribute("role", "group");
    const title = element("h2", "home__heading", `${heading} `);
    title.id = `home-heading-${key}`;
    title.append(element("span", "home__detail", `· ${detail}`));
    group.setAttribute("aria-labelledby", title.id);
    group.append(title);
    if (!rows.length) group.append(element("div", "home__empty", empty));
    for (const row of rows) group.append(this.row(row, sectionIndex));
    return group;
  }

  row({ id, cells, group, indent, muted, late }, sectionIndex) {
    const classes = ["home__row", group && "home__row--group", indent && "home__row--indent", muted && "home__row--muted",
      late && "home__row--late"]
      .filter(Boolean).join(" ");
    const node = element("div", classes);
    node.append(...cells.map(([className, text]) => element("span", `home__cell ${className}`, text)));
    if (id === null) return node;
    const index = this.options.length;
    this.options.push({ id, sectionIndex });
    node.id = `home-row-${index}`;
    node.dataset.index = String(index);
    node.setAttribute("role", "option");
    return node;
  }

  onKey(event) {
    const action = homeAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const last = this.options.length - 1;
    switch (action) {
      case "next": return this.moveTo(Math.min(this.active + 1, last));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "first": return this.moveTo(0);
      case "last": return this.moveTo(last);
      case "nextSection": return this.moveTo(this.sectionStart(1));
      case "previousSection": return this.moveTo(this.sectionStart(-1));
      case "open": return this.open(this.active);
      case "leave": return this.onLeave();
    }
  }

  /** The first row of the next (1) or previous (-1) section that has rows; where it is when
   * there is none. Going back from inside a section first goes to its own first row, as {
   * does in Vim. */
  sectionStart(direction) {
    const here = this.options[this.active]?.sectionIndex;
    if (here === undefined) return this.active;
    const starts = this.options.map((option, index) => index)
      .filter((index) => index === 0 || this.options[index - 1].sectionIndex !== this.options[index].sectionIndex);
    if (direction > 0) return starts.find((index) => index > this.active) ?? this.active;
    return starts.filter((index) => index < this.active).pop() ?? this.active;
  }

  moveTo(index) {
    if (index < 0) return;
    this.active = index;
    this.markActive();
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

  open(index) {
    const option = this.options[index];
    if (option) this.onOpen(option.id);
  }

  focus() {
    this.list.focus();
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
