// THE key table for the list pages drawn in place of the note (People, Meetings). Their key
// handling (static/js/pages/list-page.js) and any help listing both read it; nothing else
// binds keys there. "list" keys work on the list, "search" keys in the search box (where
// every other key types). Keys with Ctrl, Alt or Cmd held are left to the browser, and Tab
// moves the focus on, as everywhere.
import { keyReader } from "../ui/key-sequence.js";

export const PAGE_KEYS = [
  { scope: "list", keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { scope: "list", keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { scope: "list", keys: ["gg", "Home"], action: "first", help: "first row" },
  { scope: "list", keys: ["G", "End"], action: "last", help: "last row" },
  { scope: "list", keys: ["Enter"], action: "open", help: "open the row's note" },
  { scope: "list", keys: ["/"], action: "search", help: "go to the search box" },
  { scope: "list", keys: ["}"], action: "nextGroup", help: "the next day's first row (Meetings)" },
  { scope: "list", keys: ["{"], action: "previousGroup", help: "this day's first row, then the day before (Meetings)" },
  { scope: "list", keys: ["p"], action: "prepOnly", help: "Meetings: only those with something to prep, or all again" },
  { scope: "list", keys: ["a"], action: "add", help: "the page's New button (New person, New meeting)" },
  { scope: "list", keys: ["Escape"], action: "leave", help: "back to the note" },
  { scope: "search", keys: ["Enter", "Escape", "ArrowDown"], action: "list", help: "back to the list" },
];

const READERS = new Map([...new Set(PAGE_KEYS.map((entry) => entry.scope))]
  .map((scope) => [scope, keyReader(PAGE_KEYS.filter((entry) => entry.scope === scope))]));

/** The action a keydown means in a scope ("list" or "search"; "pending" partway through gg), or null. */
export function pageAction(event, scope) {
  return READERS.get(scope)?.(event) ?? null;
}
