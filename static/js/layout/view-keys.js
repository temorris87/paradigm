// Which key table each main-window view reads, for its key-hint bar and its ? list (the
// tables stay the only source of keys: this only points at them), and the note window's
// short fixed list, which has no table of its own. Pure.
//
//   viewTable(view, weekTab, { logStatus, project, person, followUp })  { name, table, without?, words?,
//                              field?, barWithout?, bar? } of a view: view is the PageViews key
//                              ("home", "week"...) or null for the dashboard; weekTab the Week
//                              page's "plan" | "timesheet" | "oncall"; logStatus
//                              whether the dashboard's note is a project or an area (only they
//                              keep a status log: L is left out elsewhere); project whether it
//                              is a project's (its own bar, and the rows only: "project" keeps);
//                              person whether it is a person's page: rows of a table can be
//                              page-specific (page: / notOn:); followUp whether Today's
//                              cursor is on a follow-up row (its bar reads followHint:)
//                              barWithout: left out of the bar only (still in the ? list);
//                              bar: { action: words }: the bar shows just these, in this order
//   viewHints(view, weekTab, options)  [{ cap, words }] for the bar: the table's hints, then
//                              "f follow" and "? all keys" (Live has no table: the main
//                              window's own hints)
//   viewKeyGroups(view, weekTab, options)  [{ name, rows }] for the ? list: the view's table as
//                              it groups its keys (less the ones it is without), then the window's
//                              (less the keys the view's table already lists: each key once)
//   noteHints({ sheet })       the note window's bar (no ?: there it is the editor's search back)
//   shadowedMainActions(view, weekTab)  the MAIN_KEYS actions whose keys the view's own table
//                              takes over (read first there): the Week Plan's gt (the tray, not
//                              Today); none elsewhere
import { CALENDAR_KEYS } from "../calendar/calendar-keys.js";
import { GANTT_KEYS } from "../gantt/gantt-keys.js";
import { HISTORY_KEYS } from "../history/history-keys.js";
import { HUB_KEYS, keysFor } from "../hubs/hub-keys.js";
import { ONCALL_KEYS } from "../oncall/oncall-keys.js";
import { pageKeysFor } from "../pages/page-keys.js";
import { FOLDER_KEYS } from "../resources/folder-keys.js";
import { TASK_PAGE_KEYS } from "../tasks/task-page-keys.js";
import { TIME_KEYS } from "../timesheet/time-keys.js";
import { SETTINGS_KEYS } from "../settings/settings-keys.js";
import { TODAY_KEYS } from "../today/today-keys.js";
import { capOf, hintsOf, keyGroups } from "../ui/key-hints.js";
import { MAIN_KEYS } from "./main-keys.js";

const WEEK_TABLES = {
  // Its gt is the tray's (Figma, Tyson 2026-11-27): it shadows the window's gt (Today) here only.
  plan: { name: "Week: Plan", table: CALENDAR_KEYS, shadows: true },
  timesheet: { name: "Week: Timesheet", table: TIME_KEYS },
  oncall: { name: "Week: On call", table: ONCALL_KEYS },
};

// Today with the cursor on a follow-up: Space is Followed up…, c and r show (Figma 54:953).
const TODAY_FOLLOW_UP = { name: "Today", table: TODAY_KEYS, field: "followHint" };

const VIEW_TABLES = {
  home: { name: "Today", table: TODAY_KEYS },
  // n and a both make a new person there; the bar shows n.
  people: { name: "People", table: pageKeysFor("people"), barWithout: ["add"], words: { search: "filter by name" } },
  meetings: { name: "Meetings", table: pageKeysFor("meetings") },
  // The Trash has no New button, and Enter there restores the note before it opens it.
  trash: { name: "Trash", table: pageKeysFor("trash"), without: ["add"], words: { open: "restore" } },
  template: { name: "Plan template", table: GANTT_KEYS },
  folder: { name: "Folder", table: FOLDER_KEYS },
  task: { name: "Task", table: TASK_PAGE_KEYS },
  plan: { name: "Plan", table: GANTT_KEYS },
  live: { name: "Live note", table: [] },
  history: { name: "History", table: HISTORY_KEYS },
  settings: { name: "Settings", table: SETTINGS_KEYS },
};

// Keys only a project's page has (hub-keys.js only: "project").
const PROJECT_ONLY = HUB_KEYS.filter((entry) => entry.only === "project").map((entry) => entry.action);
// A project's page: its bar as Figma draws it (projectHint:).
const PROJECT_DASHBOARD = { name: "Project", table: keysFor("project"), field: "projectHint" };
const DASHBOARD = { name: "Dashboard", table: keysFor(null), without: PROJECT_ONLY };
// A dashboard that isn't a project's or an area's has no status to log.
const PLAIN_DASHBOARD = { ...DASHBOARD, without: ["logStatus", ...PROJECT_ONLY] };
// A person's page: its own keys (Tab, a, r, n, o) and its own bar.
const PERSON = {
  name: "Person",
  table: keysFor("person"),
  without: ["logStatus", ...PROJECT_ONLY],
  bar: { next: "move", nextColumn: "next column", toggle: "done", delegate: "delegate", addTopic: "add topic",
    raised: "raised", oneOnOne: "1:1 notes", openRow: "open" },
};

// Entries of a scoped table the bar shows: the list's, not the search box's.
const barScope = (table) => (table.some((entry) => entry.scope) ? "list" : undefined);

const SCOPE_NAMES = { list: "The list", search: "The search box" };

// The window's keys every view's bar ends with.
const EVERY_BAR = ["follow", "keys"];

export function viewTable(view, weekTab = "plan", { logStatus = false, project = false, person = false, followUp = false } = {}) {
  if (view === "week") return WEEK_TABLES[weekTab] ?? WEEK_TABLES.plan;
  if (view === "home" && followUp) return TODAY_FOLLOW_UP;
  if (VIEW_TABLES[view]) return VIEW_TABLES[view];
  if (project) return PROJECT_DASHBOARD;
  if (person) return PERSON;
  return logStatus ? DASHBOARD : PLAIN_DASHBOARD;
}

export function viewHints(view, weekTab, options) {
  const { table, without = [], barWithout = [], words, field, bar } = viewTable(view, weekTab, options);
  const own = bar ? Object.entries(bar).map(([action, text]) => ({ cap: capOf(table.find((entry) => entry.action === action)), words: text }))
    : hintsOf(table, { scope: barScope(table), without: [...without, ...barWithout], words, field });
  const main = table.length ? MAIN_KEYS.filter((entry) => EVERY_BAR.includes(entry.action)) : MAIN_KEYS;
  return [...own, ...hintsOf(main)];
}

export function viewKeyGroups(view, weekTab, options) {
  const { name, table, without = [] } = viewTable(view, weekTab, options);
  const kept = table.filter((entry) => !without.includes(entry.action));
  const own = keyGroups(kept).map((group) => ({ ...group, name: group.name ? `${name}: ${SCOPE_NAMES[group.name] ?? group.name}` : name }));
  // A key the view lists (a project's g h, a dashboard's g p, the Week Plan's g t) isn't listed
  // twice: the view's words say what it does there. The main window's key still works
  // (main-keys.js) unless the view shadows it.
  const listed = new Set(kept.flatMap((entry) => entry.keys));
  const shadowed = shadowedMainActions(view, weekTab, options);
  const main = MAIN_KEYS.filter((entry) => !shadowed.includes(entry.action) && !entry.keys.some((key) => listed.has(key)));
  return [...own, ...keyGroups(main).map((group) => ({ ...group, name: "Anywhere in this window" }))];
}

export function shadowedMainActions(view, weekTab = "plan", options) {
  const { table, shadows = false } = viewTable(view, weekTab, options);
  if (!shadows) return [];
  const own = new Set(table.flatMap((entry) => entry.keys));
  return MAIN_KEYS.filter((entry) => entry.keys.some((key) => own.has(key))).map((entry) => entry.action);
}

// The note window's keys are the editor's (Vim's, static/js/editor/keys.js) and the sheet's
// Tab: no table to read hints from, so a short list of the ones that matter most there, as
// Figma's "Note window · capture by key" has it: the capture leader first.
const NOTE_HINTS = [
  { cap: "\\ t", words: "line → task" },
  { cap: "\\ q", words: "→ question" },
  { cap: "\\ d", words: "→ decision" },
  { cap: "v … \\ t", words: "from a selection" },
  { cap: "\\ u", words: "uncapture" },
  { cap: "@", words: "person" },
  { cap: ":w", words: "save" },
];

const SHEET_HINT = { cap: "Tab", words: "sheet" };

// A task's notes (tasks/task-notes-session.js) have no captures and no sheet.
const TASK_NOTES_HINTS = NOTE_HINTS.filter(({ cap }) => cap === "@" || cap === ":w");

export function noteHints({ sheet = false, task = false } = {}) {
  if (task) return TASK_NOTES_HINTS;
  return sheet ? [...NOTE_HINTS, SHEET_HINT] : NOTE_HINTS;
}
