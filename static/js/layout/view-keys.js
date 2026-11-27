// Which key table each main-window view reads, for its key-hint bar and its ? list (the
// tables stay the only source of keys: this only points at them), and the note window's
// short fixed list, which has no table of its own. Pure.
//
//   viewTable(view, weekTab, { logStatus })  { name, table, without?, words? } of a view: view
//                              is the PageViews key ("home", "week"...) or null for the dashboard;
//                              weekTab the Week page's "plan" | "timesheet" | "settings" | "oncall";
//                              logStatus whether the dashboard's note is a project or an area
//                              (only they keep a status log: L is left out elsewhere)
//   viewHints(view, weekTab, options)  [{ cap, words }] for the bar: the table's hints, then
//                              "? all keys" (Live has no table: the main window's own hints)
//   viewKeyGroups(view, weekTab, options)  [{ name, rows }] for the ? list: the view's table as
//                              it groups its keys (less the ones it is without), then the window's
//   noteHints({ sheet })       the note window's bar (no ?: there it is the editor's search back)
import { CALENDAR_KEYS } from "../calendar/calendar-keys.js";
import { GANTT_KEYS } from "../gantt/gantt-keys.js";
import { HUB_KEYS } from "../hubs/hub-keys.js";
import { ONCALL_KEYS } from "../oncall/oncall-keys.js";
import { PAGE_KEYS } from "../pages/page-keys.js";
import { FOLDER_KEYS } from "../resources/folder-keys.js";
import { TASK_PAGE_KEYS } from "../tasks/task-page-keys.js";
import { TIME_KEYS } from "../timesheet/time-keys.js";
import { TODAY_KEYS } from "../today/today-keys.js";
import { hintsOf, keyGroups } from "../ui/key-hints.js";
import { MAIN_KEYS } from "./main-keys.js";

const WEEK_TABLES = {
  plan: { name: "Week: Plan", table: CALENDAR_KEYS },
  timesheet: { name: "Week: Timesheet", table: TIME_KEYS },
  // Settings moves the week too, but has no grid to copy.
  settings: { name: "Week: Settings", table: TIME_KEYS, without: ["copy"] },
  oncall: { name: "Week: On call", table: ONCALL_KEYS },
};

const VIEW_TABLES = {
  home: { name: "Today", table: TODAY_KEYS },
  people: { name: "People", table: PAGE_KEYS },
  meetings: { name: "Meetings", table: PAGE_KEYS },
  // The Trash has no New button, and Enter there restores the note before it opens it.
  trash: { name: "Trash", table: PAGE_KEYS, without: ["add"], words: { open: "restore" } },
  template: { name: "Plan template", table: GANTT_KEYS },
  folder: { name: "Folder", table: FOLDER_KEYS },
  task: { name: "Task", table: TASK_PAGE_KEYS },
  plan: { name: "Plan", table: GANTT_KEYS },
  live: { name: "Live note", table: [] },
};

const DASHBOARD = { name: "Dashboard", table: HUB_KEYS };
// A person's dashboard (or any other that isn't a project's or an area's) has no status to log.
const PLAIN_DASHBOARD = { ...DASHBOARD, without: ["logStatus"] };

// Entries of a scoped table the bar shows: the list's, not the search box's.
const BAR_SCOPE = new Map([[PAGE_KEYS, "list"]]);

const SCOPE_NAMES = { list: "The list", search: "The search box" };

export function viewTable(view, weekTab = "plan", { logStatus = false } = {}) {
  if (view === "week") return WEEK_TABLES[weekTab] ?? WEEK_TABLES.plan;
  return VIEW_TABLES[view] ?? (logStatus ? DASHBOARD : PLAIN_DASHBOARD);
}

export function viewHints(view, weekTab, options) {
  const { table, without, words } = viewTable(view, weekTab, options);
  const own = hintsOf(table, { scope: BAR_SCOPE.get(table), without, words });
  const main = table.length ? MAIN_KEYS.filter((entry) => entry.action === "keys") : MAIN_KEYS;
  return [...own, ...hintsOf(main)];
}

export function viewKeyGroups(view, weekTab, options) {
  const { name, table, without = [] } = viewTable(view, weekTab, options);
  const own = keyGroups(table.filter((entry) => !without.includes(entry.action))).map((group) => ({ ...group, name: group.name ? `${name}: ${SCOPE_NAMES[group.name] ?? group.name}` : name }));
  return [...own, ...keyGroups(MAIN_KEYS).map((group) => ({ ...group, name: "Anywhere in this window" }))];
}

// The note window's keys are the editor's (Vim's) and the sheet's Tab: no table to read hints
// from, so a short list of the ones that matter most.
const NOTE_HINTS = [
  { cap: "i", words: "insert" },
  { cap: "Esc", words: "normal" },
  { cap: ":w", words: "save" },
  { cap: "/", words: "search" },
];

const SHEET_HINT = { cap: "Tab", words: "sheet" };

export function noteHints({ sheet = false } = {}) {
  return sheet ? [...NOTE_HINTS, SHEET_HINT] : NOTE_HINTS;
}
