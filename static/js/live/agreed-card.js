// The Live page's "Agreed in this meeting" card (028; Figma "Share · meeting capture"): beside
// a meeting's Agenda and Notes, what was captured from it so far, for everyone watching the
// screen share. It comes with each live message (live-sender.js: captures), so a capture made
// in the note window shows here at once.
//
//   const card = new AgreedCard({ onOpenTask(id), onOpenNote(id) })
//   card.root                      the <aside>
//   card.show(captures, today)     a row per capture (notes/capture-model.js agreedRows)
// Each row is a button: Enter (or a click) opens a task's page, or a question's or decision's note.
import { agreedRows } from "../notes/capture-model.js";
import { chip } from "../ui/chip.js";

export class AgreedCard {
  constructor({ onOpenTask, onOpenNote }) {
    this.onOpenTask = onOpenTask;
    this.onOpenNote = onOpenNote;
    this.root = element("aside", "live-agreed");
    this.root.setAttribute("aria-label", "Agreed in this meeting");
    this.count = element("span", "live-agreed__count");
    const head = element("h2", "live-agreed__head", "Agreed in this meeting");
    head.append(" ", this.count);
    this.list = element("ul", "live-agreed__list");
    this.empty = element("p", "live-agreed__empty", "Nothing captured yet");
    const foot = element("p", "live-agreed__foot", "Everyone sees what was agreed as you capture it.");
    this.root.append(head, this.list, this.empty, foot);
    this.shown = "";
  }

  show(captures, today) {
    const rows = agreedRows(captures ?? [], today);
    const key = JSON.stringify(rows);
    if (key === this.shown) return;
    this.shown = key;
    this.count.textContent = String(rows.length);
    this.empty.hidden = rows.length > 0;
    this.list.replaceChildren(...rows.map((row) => {
      const item = element("li", "live-agreed__item");
      const button = element("button", `live-agreed__row${row.muted ? " live-agreed__row--muted" : ""}`);
      button.type = "button";
      const line = element("span", "live-agreed__line");
      line.append(chip(row.chip.label, row.chip.tone), element("span", "live-agreed__title", row.title));
      button.append(line, element("span", "live-agreed__detail", row.detail));
      button.addEventListener("click", () => (row.task !== undefined ? this.onOpenTask(row.task) : this.onOpenNote(row.id)));
      item.append(button);
      return item;
    }));
  }
}

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
