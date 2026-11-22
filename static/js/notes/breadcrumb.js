// The open note's path above the editor: Projects › Acme › Kickoff. The hub group comes
// first, as plain text; each ancestor note can be clicked to open it.
import { groupOf } from "./hub-groups.js";

export function showBreadcrumb(nav, tree, currentId, onOpen) {
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
      const here = span("crumbs__here", note.title);
      here.setAttribute("aria-current", "page");
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
