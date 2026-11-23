// The Trash page: notes trashed in the last week, drawn in place of the note. Enter or a click
// restores one with the notes trashed with it, and opens it. A ListPage
// (static/js/pages/list-page.js) told what to show.
//
//   const page = trashPage(sectionElement, { onRestore(id), onLeave() });
//   page.show({ tree, trash }); page.focus(); page.say(text)
import { ListPage } from "../pages/list-page.js";
import { NO_TRASH, trashRows } from "./trash-model.js";

export function trashPage(section, { onRestore, onLeave }) {
  let rows = [];
  const page = new ListPage(section, {
    name: "trash",
    heading: "Trash",
    filters: [],
    search: { key: "title", label: "Title", placeholder: "any part of the title" },
    options: () => ({}),
    rows: ({ tree, trash = NO_TRASH }, filters) => {
      rows = trashRows(trash, tree, filters);
      return rows;
    },
    columns: ["Note", "Was in", "Gone in"],
    cells: (row) => [
      ["trash__title", `${row.title}${row.inside ? ` + ${row.inside}` : ""}`],
      ["trash__where", row.blocked ?? row.where],
      [`trash__gone${row.soon ? " trash__gone--soon" : ""}`, row.goneIn],
    ],
    empty: "The Trash is empty",
    onOpen: (id) => {
      const row = rows.find((each) => each.id === id);
      if (row?.blocked) page.say(`"${row.title}" can't come back yet: ${row.blocked}`);
      else onRestore(id);
    },
    onLeave,
  });
  // Under the heading: how long things stay, and what Enter does.
  const note = document.createElement("p");
  note.className = "trash__subtitle";
  note.textContent = "Kept for 7 days, then deleted for good. Enter restores a note and opens it, back where it was.";
  section.querySelector(".list-page__bar")?.after(note);
  return page;
}
