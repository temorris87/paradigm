// The note window's sections sheet. The text fills the window down to a one-line bar that names
// each section with its count; the sections slide up over the lower part of the text from it.
// It opens with a click on the bar, by Tab onto the bar (out of the editor), or :hub. It closes
// on Escape (the panel's own key), the bar again, its ✕, or the focus landing elsewhere in the
// page (the text). Dialogs, menus and pickers live outside the page (on <body>), so the sheet
// stays open under them: tasks can be ticked and edited one after another.
//
//   const sheet = new SectionSheet(rootElement, { onEnter(), onLeave() });
//     rootElement: .sheet holding .sheet__bar and the sections (.hub)
//     onEnter: put the focus in the sections (the sheet has just opened)
//     onLeave: back to the text
//   sheet.setSummary(parts)   section-summary.js parts; none hides the bar
//   sheet.open() / sheet.close() / sheet.isOpen
import { summaryText } from "./section-summary.js";

export class SectionSheet {
  constructor(root, { onEnter, onLeave }) {
    this.root = root;
    this.onEnter = onEnter;
    this.onLeave = onLeave;
    this.bar = root.querySelector(".sheet__bar");
    this.parts = [];
    // A press on the bar must not focus it first: the focus rule would open what the click shuts.
    this.bar.addEventListener("mousedown", (event) => event.preventDefault());
    this.bar.addEventListener("click", (event) => {
      if (event.target.closest(".sheet__close") || this.isOpen) return this.leave();
      this.open();
      this.onEnter();
    });
    this.bar.addEventListener("focus", (event) => this.onBarFocus(event));
    // Capture: the editor's shadow root may stop its own focus events.
    document.addEventListener("focusin", (event) => this.onFocusIn(event), true);
    this.drawBar();
  }

  get isOpen() {
    return this.root.classList.contains("sheet--open");
  }

  setSummary(parts) {
    this.parts = parts;
    this.root.hidden = parts.length === 0;
    if (!parts.length) this.close();
    this.drawBar();
  }

  open() {
    if (!this.parts.length) return;
    this.root.classList.add("sheet--open");
    this.drawBar();
  }

  close() {
    if (!this.root.classList.contains("sheet--open")) return;
    this.root.classList.remove("sheet--open");
    this.drawBar();
  }

  leave() {
    this.close();
    this.onLeave();
  }

  // Tab onto the bar opens it and goes on into the rows; Shift-Tab back out of the rows onto
  // the bar closes it and stays there, so the focus is never trapped.
  onBarFocus(event) {
    if (this.root.contains(event.relatedTarget)) return this.close();
    this.open();
    this.onEnter();
  }

  onFocusIn(event) {
    if (!this.isOpen || this.root.contains(event.target)) return;
    if (event.target.closest?.(".app")) this.close();
  }

  drawBar() {
    const open = this.isOpen;
    this.bar.setAttribute("aria-expanded", String(open));
    this.bar.title = open ? "Close the sections (Escape)" : "Show the sections (Tab from the text, or :hub)";
    const parts = this.parts.map((part, index) => {
      const node = span(`sheet__part${part.count ? "" : " sheet__part--empty"}`, "");
      node.append(span("sheet__label", part.label), " ", span("sheet__count", String(part.count)));
      if (part.flagged) node.append(" ", span("sheet__flag", `(${part.flagged} ${part.flagWord})`));
      return index ? [span("sheet__separator", "·"), node] : [node];
    }).flat();
    const end = open ? [span("sheet__close", "Esc ✕")] : [span("sheet__hint", "Tab")];
    this.bar.replaceChildren(span("sheet__caret", open ? "▾" : "▴"), ...parts, ...end);
    this.bar.setAttribute("aria-label", `Sections: ${summaryText(this.parts)}`);
  }
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
