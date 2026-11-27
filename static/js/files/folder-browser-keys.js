// THE key table of the folder browser (folder-browser.js), the "Add file…" dialog Paradigm
// draws itself when the computer's own one can't open. Its key handling and any help listing
// read it; nothing else binds keys there. "list" keys work on the list of folders and files,
// "filter" keys in the filter box (every other key types there). The list keys with hint: show
// at the dialog's foot, in the shared key caps (ui/key-hints.js).
import { hintsOf } from "../ui/key-hints.js";
import { keyReader } from "../ui/key-sequence.js";

export const FOLDER_BROWSER_KEYS = [
  { scope: "list", keys: ["j", "ArrowDown"], action: "next", help: "next folder or file" },
  { scope: "list", keys: ["k", "ArrowUp"], action: "previous", help: "previous folder or file" },
  { scope: "list", keys: ["gg"], action: "first", help: "first" },
  { scope: "list", keys: ["G"], action: "last", help: "last" },
  { scope: "list", keys: ["Enter", "l"], action: "open", help: "open the folder, or pick the file", hint: "open" },
  { scope: "list", keys: ["h", "Backspace"], action: "up", help: "up to the parent folder (from a root, the roots)", hint: "up" },
  { scope: "list", keys: ["/"], action: "filter", help: "filter by name", hint: "filter" },
  { scope: "list", keys: ["Escape"], action: "cancel", help: "cancel", hint: "cancel" },
  { scope: "filter", keys: ["Enter"], action: "list", help: "back to the list" },
  { scope: "filter", keys: ["Escape"], action: "list", help: "back to the list" },
];

const tableOf = (scope) => FOLDER_BROWSER_KEYS.filter((entry) => entry.scope === scope);

/** The list keys the dialog's foot shows: [{ cap, words }]. */
export function folderBrowserHints() {
  return hintsOf(FOLDER_BROWSER_KEYS, { scope: "list" });
}

/** A reader for the list's keys: event -> action | "pending" (the g of gg) | null. */
export function listKeyReader(options) {
  return keyReader(tableOf("list"), options);
}

/** The action a keydown in the filter box means, or null (it types). */
export function filterAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return tableOf("filter").find((entry) => entry.keys.includes(event.key))?.action ?? null;
}
