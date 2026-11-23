// A picker: a text box over a list that narrows as you type, in a modal <dialog>. It knows
// nothing about notes: it filters the items it is given and hands back the one taken.
//
//   const picked = await pickFrom({
//     title: "Go to note",
//     placeholder: "part of a title or path",
//     items: [{ id, title, detail?, muted? }],      // in the order to show them
//     query: "",                                    // typed already
//     create: (text) => `Add "${text}" as a new person`,   // optional: a last row for new text
//   });   // -> { item } | { create: text } | null when closed
//
// Every word typed must appear in the title or the detail, ignoring case; titles that match
// come before items that match only in their detail. Its keys are in ui-keys.js.
import { element, openModal, restoreFocus, uniqueId } from "./dom.js";
import { uiAction } from "./ui-keys.js";

const LIMIT = 200;

/** The items matching what was typed, best first (pure). */
export function filterItems(items, query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice();
  const inTitle = [];
  const inDetail = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    const all = `${title} ${String(item.detail ?? "").toLowerCase()}`;
    if (!words.every((word) => all.includes(word))) continue;
    (words.every((word) => title.includes(word)) ? inTitle : inDetail).push(item);
  }
  return [...inTitle, ...inDetail];
}

export function pickFrom({ title, placeholder = "", items, query = "", create = null, empty = "Nothing matches", returnFocus = null, fallbackFocus = () => {} }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog picker");
    const heading = element("h2", "dialog__title", title);
    heading.id = uniqueId("picker-title");
    dialog.setAttribute("aria-labelledby", heading.id);
    const box = element("input", "dialog__input picker__box");
    Object.assign(box, { type: "text", autocomplete: "off", placeholder, value: query });
    box.setAttribute("role", "combobox");
    box.setAttribute("aria-expanded", "true");
    const list = element("ul", "picker__list");
    list.id = uniqueId("picker-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", title);
    box.setAttribute("aria-controls", list.id);
    dialog.append(heading, box, list);
    document.body.append(dialog);

    let rows = [];
    let active = 0;
    const draw = () => {
      const text = box.value.trim();
      rows = filterItems(items, text).slice(0, LIMIT).map((item) => ({ item }));
      const exact = rows.some(({ item }) => item.title.toLowerCase() === text.toLowerCase());
      const label = create && text && !exact ? create(text) : null;
      if (label) rows.push({ create: text, label });
      active = Math.min(active, Math.max(0, rows.length - 1));
      list.replaceChildren(...(rows.length ? rows.map(row) : [element("li", "picker__empty", empty)]));
      mark();
    };
    const row = (entry, index) => {
      const li = element("li", `picker__row${entry.create ? " picker__row--create" : ""}${entry.item?.muted ? " picker__row--muted" : ""}`);
      li.id = `${list.id}-${index}`;
      li.dataset.index = String(index);
      li.setAttribute("role", "option");
      li.append(element("span", "picker__title", entry.create ? entry.label : entry.item.title));
      if (entry.item?.detail) li.append(element("span", "picker__detail", entry.item.detail));
      return li;
    };
    const mark = () => {
      const options = list.querySelectorAll("[role=option]");
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === active)));
      const chosen = options[active];
      if (chosen) {
        box.setAttribute("aria-activedescendant", chosen.id);
        chosen.scrollIntoView?.({ block: "nearest" });
      } else {
        box.removeAttribute("aria-activedescendant");
      }
    };
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      restoreFocus(returnFocus ?? before, fallbackFocus);
      resolve(result);
    };
    const take = (index) => {
      const entry = rows[index];
      if (!entry) return;
      finish(entry.create !== undefined ? { create: entry.create } : { item: entry.item });
    };
    box.addEventListener("input", () => {
      active = 0;
      draw();
    });
    box.addEventListener("keydown", (event) => {
      const action = uiAction(event, "picker");
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "next") active = Math.min(active + 1, rows.length - 1);
      if (action === "previous") active = Math.max(active - 1, 0);
      if (action === "choose") return take(active);
      if (action === "close") return finish(null);
      mark();
    });
    list.addEventListener("click", (event) => {
      const option = event.target.closest?.("[role=option]");
      if (option) take(Number(option.dataset.index));
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    draw();
    openModal(dialog, box);
    box.setSelectionRange?.(box.value.length, box.value.length);
  });
}
