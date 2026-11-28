// THE key table of a project's History page (history-page.js). Its key handling and any help
// listing both read it; nothing else binds keys there. "list" keys work on the list, "search"
// keys in the search box (where every other key types). Keys with Ctrl, Alt or Cmd held are
// left to the browser, and Tab moves the focus on, as everywhere.
import { keyReader } from "../ui/key-sequence.js";

export const HISTORY_KEYS = [
  { scope: "list", keys: ["j", "ArrowDown"], action: "next", help: "next row (past the last, older weeks load)", hint: "move", label: "j k" },
  { scope: "list", keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { scope: "list", keys: ["Enter"], action: "open", help: "open the row's meeting, decision, question or task page", hint: "open" },
  { scope: "list", keys: ["1", "2", "3", "4", "5"], action: "tab", help: "pick a tab: Everything, Meetings, Done tasks, Decisions, Answered",
    hint: "tab", label: "1-5" },
  { scope: "list", keys: ["/"], action: "search", help: "search: filter titles and details as you type", hint: "search" },
  { scope: "list", keys: ["Escape"], action: "leave", help: "back to the project", hint: "back to project" },
  { scope: "search", keys: ["Enter", "Escape"], action: "list", help: "back to the list" },
];

const READERS = new Map([...new Set(HISTORY_KEYS.map((entry) => entry.scope))]
  .map((scope) => [scope, keyReader(HISTORY_KEYS.filter((entry) => entry.scope === scope))]));

/** The action a keydown means in a scope ("list" or "search"), or null. */
export function historyAction(event, scope) {
  return READERS.get(scope)?.(event) ?? null;
}
