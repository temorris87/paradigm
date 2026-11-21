// The open note's path above the editor: Projects › Acme › Kickoff. Each ancestor can be
// clicked to open it.

export function showBreadcrumb(nav, tree, currentId, onOpen) {
  const parts = [];
  for (const note of tree.has(currentId) ? tree.path(currentId) : []) {
    if (parts.length) {
      const separator = document.createElement("span");
      separator.className = "crumbs__separator";
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = "›";
      parts.push(separator);
    }
    if (note.id === currentId) {
      const here = document.createElement("span");
      here.className = "crumbs__here";
      here.setAttribute("aria-current", "page");
      here.textContent = note.title;
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
