// A folder's page, in the main window (&folder=ID): where it is, its buttons (New note…, New
// folder…, Rename…, Move…, Move to trash…), then its folders and its notes. A folder opens
// here; a note opens in the note window.
//
//   const page = new FolderPage(section, { app: () => notesApp, onLeave() });
//   page.show(ctx)      ctx.tree, ctx.folders, ctx.folderId
//   page.focus()
import { dayText } from "../ui/dates.js";
import { dayOf } from "../hubs/hub-sections.js";
import { moveFolderDialog, newFolderDialog, newResourceDialog, renameFolderDialog,
  trashFolderDialog } from "./folder-commands.js";
import { countIn, notesIn } from "./folders-model.js";

export class FolderPage {
  constructor(section, { app, onLeave }) {
    this.section = section;
    this.app = app;
    section.classList.add("folder-page");
    section.tabIndex = -1;
    this.head = element("header", "folder-page__head");
    this.list = element("ul", "folder-page__list");
    this.list.setAttribute("aria-label", "In this folder");
    section.replaceChildren(this.head, this.list);
    section.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.target.closest("dialog")) {
        event.preventDefault();
        onLeave();
      }
    });
  }

  show(ctx) {
    const { folders, folderId, tree } = ctx;
    const folder = folders?.get(folderId) ?? null;
    if (!folder) {
      this.head.replaceChildren(element("h2", "folder-page__title", "That folder is gone"));
      this.list.replaceChildren();
      return;
    }
    const app = this.app();
    const path = element("nav", "folder-page__path");
    path.setAttribute("aria-label", "Where this folder is");
    path.append(element("span", "folder-page__crumb", "Resources"));
    for (const above of folders.path(folder.id).slice(0, -1)) {
      path.append(element("span", "folder-page__separator", "›"),
        button(above.title, "Open this folder", () => app.showFolder(above.id), "folder-page__crumb-link"));
    }
    const run = (promise) => app.guard(promise);
    this.head.replaceChildren(path, element("h2", "folder-page__title", folder.title),
      element("div", "folder-page__buttons", null, [
        button("New note…", "A note in this folder", () => run(newResourceDialog(app, folder.id))),
        button("New folder…", "A folder inside this one", () => run(newFolderDialog(app, folder.id))),
        button("Rename…", "Rename this folder", () => run(renameFolderDialog(app, folder.id))),
        button("Move…", "Into another folder", () => run(moveFolderDialog(app, folder.id))),
        button("Move to trash…", "This folder, the folders in it and their notes", () => run(trashFolderDialog(app, folder.id)),
          "folder-page__button folder-page__button--danger"),
      ]));
    const kids = folders.children(folder.id).map((each) => row(`${each.title} /`, countText(countIn(tree, folders, each.id)),
      "folder-page__row folder-page__row--folder", () => app.showFolder(each.id)));
    const notes = notesIn(tree, folders, folder.id).map((note) => row(note.title, dayText(dayOf(note.updated_at), { weekday: false }),
      "folder-page__row", () => run(app.open(note.id))));
    this.list.replaceChildren(...kids, ...notes);
    if (!kids.length && !notes.length) {
      const empty = element("li", "folder-page__empty");
      empty.append("Nothing in it yet: ", button("+ New note", "A note in this folder", () => run(newResourceDialog(app, folder.id))));
      this.list.append(empty);
    }
  }

  focus() {
    (this.list.querySelector("button") ?? this.section).focus();
  }
}

function countText(n) {
  return n === 1 ? "1 note" : `${n} notes`;
}

function row(title, detail, className, onClick) {
  const li = element("li", "folder-page__item");
  const node = button(title, "", onClick, className);
  node.append(element("span", "folder-page__detail", detail));
  li.append(node);
  return li;
}

function button(text, title, onClick, className = "folder-page__button") {
  const node = element("button", className, text);
  node.type = "button";
  if (title) node.title = title;
  node.addEventListener("click", onClick);
  return node;
}

function element(tag, className, text = null, children = []) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== null) node.textContent = text;
  node.append(...children);
  return node;
}
