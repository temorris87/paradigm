// The People page: the directory with filters, drawn in place of the note. It draws what it
// is given and tells the app which person to open; the app shows and hides it.
//
//   const page = new PeoplePage(sectionElement, { onOpen(id), onLeave() });
//   page.show({ tree, people })   draw (again) with the filters as they are
//   page.focus()                  the list
//
// The list is one focus stop (a listbox with aria-activedescendant, as on the hub panel);
// the filters are ordinary form fields, so Tab goes through them like on any web page.
import { filterOptions, filterPeople, hubLinks, workText } from "./people-model.js";
import { peopleAction } from "./people-keys.js";

const ANY = "";
const FILTERS = [
  { key: "hubId", label: "Hub" },
  { key: "role", label: "Role" },
  { key: "org", label: "Organisation" },
];

export class PeoplePage {
  constructor(section, { onOpen, onLeave }) {
    this.section = section;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.ctx = null;
    this.filters = { hubId: null, role: "", org: "", name: "" };
    this.rows = [];
    this.active = 0;
    this.count = element("span", "people__count");
    const heading = element("h2", "people__heading", "People ");
    heading.append(this.count);
    this.selects = new Map(FILTERS.map(({ key, label }) => [key, this.select(key, label)]));
    this.nameBox = element("input", "people__name");
    Object.assign(this.nameBox, { type: "search", placeholder: "any part of the name", autocomplete: "off" });
    this.nameBox.addEventListener("input", () => this.setFilter("name", this.nameBox.value));
    this.nameBox.addEventListener("keydown", (event) => this.onNameKey(event));
    const filters = element("div", "people__filters");
    filters.append(...[...this.selects.values()].map((s) => s.closest("label")), labelled("Name", this.nameBox));
    this.list = element("ul", "people__list");
    this.list.id = "people-list";
    this.list.tabIndex = 0;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "People");
    this.list.addEventListener("keydown", (event) => this.onListKey(event));
    this.list.addEventListener("click", (event) => {
      const row = event.target.closest?.("[role=option]");
      if (row) this.openRow(Number(row.dataset.index));
    });
    const bar = element("div", "people__bar");
    bar.append(heading, filters);
    section.replaceChildren(bar, this.list);
  }

  select(key, label) {
    const select = element("select", "people__filter");
    select.dataset.filter = key;
    select.addEventListener("change", () => {
      const value = select.value;
      this.setFilter(key, key === "hubId" ? (value === ANY ? null : Number(value)) : value);
    });
    labelled(label, select);
    return select;
  }

  show(ctx) {
    this.ctx = ctx;
    const activeId = this.rows[this.active]?.id;
    this.fillOptions();
    this.rows = filterPeople(ctx.tree, ctx.people, this.filters);
    this.active = Math.max(0, this.rows.findIndex((note) => note.id === activeId));
    this.draw();
  }

  fillOptions() {
    const { hubs, roles, orgs } = filterOptions(this.ctx.tree, this.ctx.people);
    const choices = {
      hubId: hubs.map((hub) => [String(hub.id), hub.title]),
      role: roles.map((role) => [role, role]),
      org: orgs.map((org) => [org, org]),
    };
    for (const [key, select] of this.selects) {
      const current = this.filters[key] === null ? ANY : String(this.filters[key]);
      const options = [[ANY, "any"], ...choices[key]];
      // A value no one has any more (a role renamed in another tab): back to "any".
      if (!options.some(([value]) => value === current)) this.filters[key] = key === "hubId" ? null : "";
      select.replaceChildren(...options.map(([value, text]) => {
        const option = element("option", "", text);
        option.value = value;
        return option;
      }));
      select.value = this.filters[key] === null ? ANY : String(this.filters[key]);
    }
  }

  setFilter(key, value) {
    this.filters[key] = value;
    this.rows = filterPeople(this.ctx.tree, this.ctx.people, this.filters);
    this.active = 0;
    this.draw();
  }

  draw() {
    const { tree, people } = this.ctx;
    const total = this.rows.length;
    this.count.textContent = `· ${total}`;
    this.list.replaceChildren(...(total
      ? this.rows.map((note, index) => this.row(note, index, tree, people))
      : [element("li", "people__empty", "No one matches (:newperson {name} adds someone)")]));
    this.markActive();
  }

  row(note, index, tree, people) {
    const li = element("li", "people__row");
    li.id = `people-row-${index}`;
    li.dataset.index = String(index);
    li.setAttribute("role", "option");
    const hubs = hubLinks(tree, people, note.id).filter((link) => !link.archived)
      .map(({ hub, role }) => (role ? `${hub.title} (${role})` : hub.title)).join(", ");
    li.append(element("span", "people__title", note.title),
      element("span", "people__work", workText(people.get(note.id))),
      element("span", "people__hubs", hubs));
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
    const action = peopleAction(event, "list");
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
      case "name": return this.nameBox.focus();
      case "leave": return this.onLeave();
    }
  }

  onNameKey(event) {
    if (peopleAction(event, "name") !== "list") return;
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
    const note = this.rows[index];
    if (note) this.onOpen(note.id);
  }

  focus() {
    this.list.focus();
  }
}

function labelled(text, field) {
  const label = element("label", "people__label");
  label.append(element("span", "people__label-text", text), field);
  return label;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
