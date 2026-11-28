// THE key table for the list pages drawn in place of the note (People, Meetings, Trash). Their
// key handling (static/js/pages/list-page.js) and any help listing both read it; nothing else
// binds keys there. "list" keys work on the list, "search" keys in the search box (where
// every other key types). A row with page: works on that page only (People's o and n). Keys
// with Ctrl, Alt or Cmd held are left to the browser, and Tab moves the focus on, as
// everywhere.
//
//   pageAction(event, scope, page?)   the action a keydown means ("pending" partway through gg)
//   pageKeysFor(page)                 the rows that work on a page ("people", "meetings"...)
import { keyReader } from "../ui/key-sequence.js";

export const PAGE_KEYS = [
  { scope: "list", keys: ["j", "ArrowDown"], action: "next", help: "next row", hint: "move", label: "j k" },
  { scope: "list", keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { scope: "list", keys: ["gg", "Home"], action: "first", help: "first row" },
  { scope: "list", keys: ["G", "End"], action: "last", help: "last row" },
  { scope: "list", keys: ["Enter"], action: "open", help: "open the row's note", hint: "open" },
  { scope: "list", keys: ["/"], action: "search", help: "go to the search box", hint: "search" },
  { scope: "list", keys: ["}"], action: "nextGroup", help: "the next day's first row (Meetings)" },
  { scope: "list", keys: ["{"], action: "previousGroup", help: "this day's first row, then the day before (Meetings)" },
  { scope: "list", keys: ["p"], action: "prepOnly", help: "Meetings: only those with something to prep, or all again" },
  { scope: "list", keys: ["o"], action: "openOnly", page: "people", help: "People: Something open or Everyone", hint: "open items / everyone" },
  { scope: "list", keys: ["n"], action: "new", page: "people", help: "People: New person, as + New person", hint: "new person" },
  { scope: "list", keys: ["a"], action: "add", help: "the page's New button (New person, New meeting)", hint: "new" },
  { scope: "list", keys: ["Escape"], action: "leave", help: "back to the note" },
  { scope: "search", keys: ["Enter", "Escape", "ArrowDown"], action: "list", help: "back to the list" },
];

export function pageKeysFor(page = null) {
  return PAGE_KEYS.filter((entry) => entry.page === undefined || entry.page === page);
}

const READERS = new Map();

export function pageAction(event, scope, page = null) {
  const key = `${page}|${scope}`;
  if (!READERS.has(key)) READERS.set(key, keyReader(pageKeysFor(page).filter((entry) => entry.scope === scope)));
  return READERS.get(key)(event);
}
