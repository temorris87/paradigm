// What the palette lists for what is typed (static/js/palette/palette.js draws it). Pure.
//
//   PAGES                               the pages, each with its note command and key
//   commandKeys(tables)                 Map: command name -> its key, from every key table
//                                       entry that names a command ({ keys, command })
//   paletteGroups({ query, recent, notes, commands, keys, window })
//     query    what is typed; ":" first lists commands
//     recent   [item]: notes opened last (shown with nothing typed)
//     notes    [item]: every note to go to (note-actions.js goToItems)
//     commands NOTE_COMMANDS
//     window   "main" | "note": the main window leaves out noteOnly commands
//   -> [{ label, items: [{ kind: "note" | "page" | "command", key, title, detail, hint, id?,
//         command?, arg?, bang? }] }], empty groups left out
//   parseCommand(text)                  ":log! x" -> { name, bang, arg } (name as typed)
//   findCommand(commands, name)         the command an abbreviation means (as Vim: name
//                                       starts with it and it is at least min long), or null
import { filterItems } from "../ui/picker.js";

export const PAGES = [
  { label: "Today", command: "home" },
  { label: "Week", command: "calendar" },
  { label: "Timesheet", command: "time" },
  { label: "On call", command: "oncall" },
  { label: "Meetings", command: "meetings" },
  { label: "People", command: "people" },
  { label: "Trash", command: "trashed" },
];
const MAX_NOTES = 50;

export function commandKeys(tables) {
  const keys = new Map();
  for (const entry of tables.flat()) {
    if (entry.command && !keys.has(entry.command)) keys.set(entry.command, entry.keys[0]);
  }
  return keys;
}

export function parseCommand(text) {
  const match = /^:?\s*([a-z]*)(!?)\s*(.*)$/i.exec(String(text).trim());
  return match ? { name: match[1].toLowerCase(), bang: match[2] === "!", arg: match[3] } : { name: "", bang: false, arg: "" };
}

export function findCommand(commands, name) {
  if (!name) return null;
  return commands.find((command) => command.name === name)
    ?? commands.find((command) => command.name.startsWith(name) && name.length >= command.min) ?? null;
}

function pageItems(keys) {
  return PAGES.map((page) => ({ kind: "page", key: `page:${page.command}`, title: page.label, detail: "",
    hint: keys.get(page.command) ?? "", command: page.command, arg: "", bang: false }));
}

export function paletteGroups({ query = "", recent = [], notes = [], commands = [], keys = new Map(), window = "main" }) {
  const text = String(query).trim();
  const groups = [];
  if (!text) {
    groups.push({ label: "Recent", items: recent.map((item) => ({ ...item, kind: "note", key: `note:${item.id}` })) });
    groups.push({ label: "Pages", items: pageItems(keys) });
    return groups.filter((group) => group.items.length);
  }
  if (text.startsWith(":")) {
    const { name, bang, arg } = parseCommand(text);
    const usable = commands.filter((command) => !(window === "main" && command.noteOnly));
    const exact = findCommand(usable, name);
    const matches = usable.filter((command) => command === exact || (name && (command.name.startsWith(name)
      || command.label.toLowerCase().includes(name))) || !name);
    groups.push({ label: "Commands", items: matches.map((command) => ({
      kind: "command", key: `command:${command.name}`, title: command.label, detail: command.help,
      hint: [command.usage, keys.get(command.name)].filter(Boolean).join(" "), command: command.name,
      arg: command === exact ? arg : "", bang: command === exact ? bang : false,
    })) });
    // Notes whose title has the words typed after the colon ("Logging conventions" for :log).
    const words = `${name} ${arg}`.trim();
    if (words) groups.push({ label: "Notes", items: filterItems(notes, words).slice(0, MAX_NOTES).map((item) => ({ ...item, kind: "note", key: `note:${item.id}` })) });
    return groups.filter((group) => group.items.length);
  }
  groups.push({ label: "Notes", items: filterItems(notes, text).slice(0, MAX_NOTES).map((item) => ({ ...item, kind: "note", key: `note:${item.id}` })) });
  groups.push({ label: "Pages", items: filterItems(pageItems(keys), text) });
  return groups.filter((group) => group.items.length);
}
