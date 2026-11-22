// The open note's path above the editor: Projects › Acme › Kickoff ▾. The hub group comes
// first, as plain text; each ancestor note can be clicked to open it, and the open note's own
// name opens its menu (onMenu(button): static/js/notes/note-actions.js).
import { groupOf } from "./hub-groups.js";

export function showBreadcrumb(nav, tree, currentId, onOpen, onMenu = () => {}) {
  if (!tree.has(currentId)) {
    nav.replaceChildren();
    return;
  }
  const parts = [span("crumbs__group", groupOf(tree, currentId).heading)];
  for (const note of tree.path(currentId)) {
    const separator = span("crumbs__separator", "›");
    separator.setAttribute("aria-hidden", "true");
    parts.push(separator);
    if (note.id === currentId) {
      const here = document.createElement("button");
      here.type = "button";
      here.className = "crumbs__here crumbs__menu";
      here.title = "What you can do with this note";
      here.setAttribute("aria-current", "page");
      here.setAttribute("aria-haspopup", "menu");
      here.setAttribute("aria-expanded", "false");
      here.append(span("crumbs__title", note.title), span("crumbs__caret", "▾"));
      here.addEventListener("click", () => onMenu(here));
      parts.push(here);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "crumbs__link";
      button.textContent = note.title;
      button.addEventListener("click", () => onOpen(note.id));
      parts.push(button);
    }
  }
  nav.replaceChildren(...parts);
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
