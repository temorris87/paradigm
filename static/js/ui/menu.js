// A popup menu under a button: what can be done here, one click (or Enter) away. It knows
// nothing about notes: it shows the entries it is given and runs the one chosen.
//
//   openMenu(anchorButton, [
//     { label: "Rename…", run() },
//     { label: "Project", checked: true, run() },     // a ticked choice (menuitemradio)
//     { group: "File as" },                           // a label over the next items
//     "separator",
//     { label: "Move to trash…", danger: true, disabled: false, hint: "…", run() },
//   ], { label: "Note actions", onClose(), fallbackFocus(), back() });
//
// Only one menu is open at a time. It closes on Escape (the focus goes back to the button, or
// to fallbackFocus() when the page was redrawn under the menu and the button is gone),
// a click outside, the focus leaving it, or a choice (then the chosen action decides where the
// focus goes). back(), when given, is where the focus belongs instead of the button: Escape
// calls it, and so does a choice before its action runs (a dialog it opens then comes back
// there, not to the gone menu item). Its keys are in ui-keys.js.
import { element, uniqueId } from "./dom.js";
import { uiAction } from "./ui-keys.js";

let current = null;

export function openMenu(anchor, entries, { label = "Actions", onClose = () => {}, fallbackFocus = () => {}, back = null } = {}) {
  closeMenu();
  current = new Menu(anchor, entries, { label, onClose, fallbackFocus, back });
  return current;
}

export function closeMenu() {
  current?.close({ refocus: false });
}

/** The open menu, or null (for tests). */
export function openedMenu() {
  return current;
}

class Menu {
  constructor(anchor, entries, { label, onClose, fallbackFocus, back }) {
    this.anchor = anchor;
    this.onClose = onClose;
    this.fallbackFocus = fallbackFocus;
    this.back = back;
    this.node = element("div", "menu");
    this.node.id = uniqueId("menu");
    this.node.setAttribute("role", "menu");
    this.node.setAttribute("aria-label", label);
    this.items = [];
    for (const entry of entries) this.node.append(this.entry(entry));
    document.body.append(this.node);
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-controls", this.node.id);
    this.place();
    this.node.addEventListener("keydown", (event) => this.onKey(event));
    this.node.addEventListener("focusout", (event) => {
      const to = event.relatedTarget;
      if (to && !this.node.contains(to)) this.close({ refocus: false });
    });
    this.onPointer = (event) => {
      if (!this.node.contains(event.target) && !anchor.contains(event.target)) this.close({ refocus: false });
    };
    document.addEventListener("pointerdown", this.onPointer, true);
    this.focusItem(this.items.findIndex((item) => !item.disabled));
  }

  entry(entry) {
    if (entry === "separator") {
      const line = element("div", "menu__separator");
      line.setAttribute("role", "separator");
      return line;
    }
    if (entry.group) return element("div", "menu__group", entry.group);
    const item = element("button", `menu__item${entry.danger ? " menu__item--danger" : ""}`);
    item.type = "button";
    item.tabIndex = -1;
    const radio = entry.checked !== undefined;
    item.setAttribute("role", radio ? "menuitemradio" : "menuitem");
    if (radio) item.setAttribute("aria-checked", String(Boolean(entry.checked)));
    item.append(element("span", "menu__mark", radio && entry.checked ? "✓" : ""), element("span", "menu__label", entry.label));
    if (entry.hint) item.append(element("span", "menu__hint", entry.hint));
    if (entry.disabled) item.setAttribute("aria-disabled", "true");
    item.addEventListener("click", () => this.choose(this.items.indexOf(item)));
    item.addEventListener("pointerenter", () => {
      if (!entry.disabled) this.focusItem(this.items.indexOf(item));
    });
    item.run = entry.run;
    item.disabled = Boolean(entry.disabled);
    this.items.push(item);
    return item;
  }

  place() {
    const box = this.anchor.getBoundingClientRect();
    const width = this.node.offsetWidth;
    const height = this.node.offsetHeight;
    const left = Math.max(4, Math.min(box.left, window.innerWidth - width - 8));
    const below = box.bottom + 2;
    const top = below + height > window.innerHeight - 4 ? Math.max(4, box.top - height - 2) : below;
    // CSSOM, not a style="" attribute: the CSP allows this one.
    this.node.style.setProperty("left", `${left}px`);
    this.node.style.setProperty("top", `${top}px`);
  }

  onKey(event) {
    const action = uiAction(event, "menu");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const at = this.items.indexOf(document.activeElement);
    const enabled = this.items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);
    const place = enabled.indexOf(at);
    switch (action) {
      case "next": return this.focusItem(enabled[Math.min(place + 1, enabled.length - 1)]);
      case "previous": return this.focusItem(enabled[Math.max(place - 1, 0)]);
      case "first": return this.focusItem(enabled[0]);
      case "last": return this.focusItem(enabled[enabled.length - 1]);
      case "choose": return this.choose(at);
      case "close": return this.close({ refocus: true });
    }
  }

  focusItem(index) {
    this.items[index]?.focus();
  }

  choose(index) {
    const item = this.items[index];
    if (!item || item.disabled) return;
    this.close({ refocus: false });
    this.back?.();
    item.run?.();
  }

  close({ refocus }) {
    if (current !== this) return;
    current = null;
    document.removeEventListener("pointerdown", this.onPointer, true);
    this.anchor.setAttribute("aria-expanded", "false");
    this.node.remove();
    if (refocus && this.back) this.back();
    else if (refocus && this.anchor.isConnected) this.anchor.focus();
    else if (refocus) this.fallbackFocus();
    this.onClose();
  }
}
