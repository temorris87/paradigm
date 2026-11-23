// A folder's page, in the main window (&folder=ID): where it is, its name and what it holds
// (reference material, not tracked work), New note (a) and New folder, ⋯ (Rename…, Move…,
// Move to trash…), a filter and the sort, then its folders and its notes with what links to
// each (hubs, from the link index) and when it was last edited. A folder opens here; a note
// opens in the note window. Its keys: folder-keys.js.
//
//   const page = new FolderPage(section, { app: () => notesApp, onLeave() });
//   page.show(ctx)      ctx.tree, ctx.folders, ctx.folderId
//   page.focus()
import { dayText } from "../ui/dates.js";
import { dayOf } from "../hubs/hub-sections.js";
import { moveFolderDialog, newFolderDialog, newResourceDialog, renameFolderDialog,
  trashFolderDialog } from "./folder-commands.js";
import { countIn, notesIn } from "./folders-model.js";
import { linksInto } from "../notes/links.js";
import { hubOf } from "../notes/hub-groups.js";
import { openMenu } from "../ui/menu.js";
import { folderAction } from "./folder-keys.js";

export class FolderPage {
  constructor(section, { app, onLeave }) {
    this.section = section;
    this.app = app;
    section.classList.add("folder-page");
    section.tabIndex = -1;
    this.head = element("header", "folder-page__head");
    this.list = element("ul", "folder-page__list");
    this.list.setAttribute("aria-label", "In this folder");
    this.filter = "";
    this.sort = "edited";
    this.tools = element("div", "folder-page__tools");
    const box = element("input", "folder-page__filter");
    Object.assign(box, { type: "search", placeholder: "Filter by title", autocomplete: "off" });
    box.addEventListener("input", () => {
      this.filter = box.value;
      if (this.ctx) this.show(this.ctx);
    });
    const sort = element("select", "folder-page__sort");
    sort.setAttribute("aria-label", "Sort");
    for (const [value, text] of [["edited", "Sort: last edited"], ["title", "Sort: title"]]) {
      const option = element("option", "", text);
      option.value = value;
      sort.append(option);
    }
    sort.addEventListener("change", () => {
      this.sort = sort.value;
      if (this.ctx) this.show(this.ctx);
    });
    this.tools.append(box, sort);
    const columns = element("div", "folder-page__columns");
    columns.setAttribute("aria-hidden", "true");
    columns.append(element("span", "", "Title"), element("span", "", "Linked from"), element("span", "", "Edited"));
    section.replaceChildren(this.head, this.tools, columns, this.list);
    section.addEventListener("keydown", (event) => {
      if (event.target.closest("dialog, input, select")) return;
      const action = folderAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === "leave") onLeave();
      if (action === "newNote" && this.folder) this.app().guard(newResourceDialog(this.app(), this.folder.id));
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
    this.ctx = ctx;
    this.folder = folder;
    const kidsOf = folders.children(folder.id);
    const notesHere = notesIn(tree, folders, folder.id);
    const more = button("⋯", "Rename, move or trash the folder", () => openMenu(more, [
      { label: "Rename…", run: () => run(renameFolderDialog(app, folder.id)) },
      { label: "Move…", run: () => run(moveFolderDialog(app, folder.id)) },
      "separator",
      { label: "Move to trash…", danger: true, run: () => run(trashFolderDialog(app, folder.id)) },
    ], { label: folder.title }), "folder-page__button folder-page__more");
    const newNote = button("New note ", "A note in this folder (a)", () => run(newResourceDialog(app, folder.id)),
      "folder-page__button folder-page__button--primary");
    newNote.append(element("kbd", "folder-page__key", "a"));
    const titleLine = element("div", "folder-page__titles");
    titleLine.append(element("h2", "folder-page__title", folder.title), element("p", "folder-page__summary",
      [countText(notesHere.length), kidsOf.length ? `${kidsOf.length} folder${kidsOf.length === 1 ? "" : "s"}` : "", "reference material, not tracked work"]
        .filter(Boolean).join(" · ")));
    this.head.replaceChildren(path, titleLine, element("div", "folder-page__buttons", null, [newNote,
      button("New folder…", "A folder inside this one", () => run(newFolderDialog(app, folder.id))), more]));
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = (title) => words.every((word) => title.toLowerCase().includes(word));
    const kids = kidsOf.filter((each) => shown(each.title)).map((each) => row(`${each.title} /`, "", countText(countIn(tree, folders, each.id)),
      "folder-page__row folder-page__row--folder", () => app.showFolder(each.id)));
    const ordered = [...notesHere].filter((note) => shown(note.title)).sort(this.sort === "title"
      ? (a, b) => a.title.localeCompare(b.title) : (a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
    const notes = ordered.map((note) => row(note.title, linkedFrom(ctx, note), dayText(dayOf(note.updated_at), { weekday: false }),
      "folder-page__row", () => run(app.open(note.id))));
    this.list.replaceChildren(...kids, ...notes);
    if (!kids.length && !notes.length) {
      const empty = element("li", "folder-page__empty");
      if (words.length) empty.append("Nothing matches");
      else empty.append("Nothing in it yet: ", button("+ New note", "A note in this folder", () => run(newResourceDialog(app, folder.id))));
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

/** "Event bus ×2, Gateway": the hubs whose notes link to it (the link index), with counts. */
function linkedFrom({ tree, links }, note) {
  if (!links) return "";
  const counts = new Map();
  for (const { note: from } of linksInto(tree, links, note)) {
    const hub = hubOf(tree, from.id) ?? from;
    counts.set(hub.title, (counts.get(hub.title) ?? 0) + 1);
  }
  return [...counts].map(([title, n]) => (n > 1 ? `${title} ×${n}` : title)).join(", ");
}

function row(title, linked, detail, className, onClick) {
  const li = element("li", "folder-page__item");
  const node = button("", "", onClick, className);
  node.append(element("span", "folder-page__name", title), element("span", "folder-page__linked", linked),
    element("span", "folder-page__detail", detail));
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
