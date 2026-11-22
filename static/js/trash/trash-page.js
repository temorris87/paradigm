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
    cells: (row) => [
      ["trash__title", row.title],
      ["trash__where", row.blocked ?? row.where],
      ["trash__inside", row.inside],
      ["trash__when", row.when],
    ],
    empty: "The Trash is empty",
    onOpen: (id) => {
      const row = rows.find((each) => each.id === id);
      if (row?.blocked) page.say(`"${row.title}" can't come back yet: ${row.blocked}`);
      else onRestore(id);
    },
    onLeave,
  });
  return page;
}
