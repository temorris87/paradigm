// The Import panel over the Week Plan's grid (css/import-panel.css): while today's calendar
// isn't imported (import-state.js showsPanel), the grid greys out under it and takes no
// clicks, drags or focus; the tray beside it stays live. The panel holds the Outlook steps, a
// drop zone (a drop anywhere on the Plan tab imports: CalendarPage listens), Import a file… (i)
// and Plan without it. It draws and reports; CalendarPage decides.
//
//   const panel = new ImportPanel({ cell, grid, onPick(), onPlanWithout() })
//     cell: where the panel goes (over grid, in the same grid cell); grid: the element it greys
//   panel.draw({ shown, lastText })   shown: whether it shows; lastText: the "Last imported" line
//   panel.shown -> boolean
//   panel.focus()                     its Import a file… button
import { keyCap } from "../ui/key-hints.js";

export class ImportPanel {
  constructor({ cell, grid, onPick, onPlanWithout }) {
    this.grid = grid;
    this.node = element("div", "import-panel");
    this.node.hidden = true;
    const card = element("section", "import-panel__card");
    card.setAttribute("role", "region");
    const title = element("h2", "import-panel__title", "Today's calendar isn't imported");
    title.id = "import-panel-title";
    card.setAttribute("aria-labelledby", title.id);
    const steps = element("p", "import-panel__steps",
      "In Outlook: File › Save Calendar › Next 7 days, Full details. Then import that file.");
    const drop = element("div", "import-panel__drop");
    drop.append(element("strong", "import-panel__drop-title", "Drop the .ics here"),
      element("span", "import-panel__drop-hint", "or press i to pick it"));
    this.pick = button("import-panel__button import-panel__button--primary", "Import a file… ", onPick);
    this.pick.append(keyCap("i"));
    const without = button("import-panel__button", "Plan without it", onPlanWithout);
    const actions = element("div", "import-panel__actions");
    actions.append(this.pick, without);
    this.last = element("p", "import-panel__last");
    card.append(title, steps, drop, actions, this.last);
    this.node.append(card);
    // A file dragged over the panel lights the drop zone; the drop itself bubbles to the page.
    this.node.addEventListener("dragover", () => drop.classList.add("import-panel__drop--over"));
    for (const type of ["dragleave", "drop"]) this.node.addEventListener(type, () => drop.classList.remove("import-panel__drop--over"));
    cell.append(this.node);
  }

  get shown() {
    return !this.node.hidden;
  }

  draw({ shown, lastText }) {
    this.node.hidden = !shown;
    this.last.textContent = lastText;
    // inert: the greyed grid takes no clicks, drags or focus while the panel is up.
    this.grid.inert = shown;
  }

  focus() {
    this.pick.focus({ preventScroll: true });
  }
}

function button(className, text, onClick) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
