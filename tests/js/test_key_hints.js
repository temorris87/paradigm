// The key-hint bar (static/js/ui/key-hints.js), each view's table (layout/view-keys.js) and
// the ? list (ui/keys-dialog.js).
import { CALENDAR_KEYS } from "../../static/js/calendar/calendar-keys.js";
import { NORMAL_KEYS, VISUAL_KEYS } from "../../static/js/editor/keys.js";
import { CAPTURE_SHEET_KEYS } from "../../static/js/notes/capture-sheet-keys.js";
import { FOLDER_BROWSER_KEYS } from "../../static/js/files/folder-browser-keys.js";
import { GANTT_KEYS } from "../../static/js/gantt/gantt-keys.js";
import { HUB_KEYS } from "../../static/js/hubs/hub-keys.js";
import { MAIN_KEYS, mainAction } from "../../static/js/layout/main-keys.js";
import { noteHints, viewHints, viewKeyGroups, viewTable } from "../../static/js/layout/view-keys.js";
import { ONCALL_KEYS } from "../../static/js/oncall/oncall-keys.js";
import { PAGE_KEYS } from "../../static/js/pages/page-keys.js";
import { FOLDER_KEYS } from "../../static/js/resources/folder-keys.js";
import { TASK_PAGE_KEYS } from "../../static/js/tasks/task-page-keys.js";
import { TIME_KEYS } from "../../static/js/timesheet/time-keys.js";
import { TODAY_KEYS } from "../../static/js/today/today-keys.js";
import { TRIAGE_KEYS } from "../../static/js/triage/triage-keys.js";
import { UI_KEYS } from "../../static/js/ui/ui-keys.js";
import { capKeys, drawKeyHints, hintsOf, keyGroups, keyName } from "../../static/js/ui/key-hints.js";
import { openKeysDialog } from "../../static/js/ui/keys-dialog.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const TABLES = { MAIN_KEYS, TODAY_KEYS, HUB_KEYS, CALENDAR_KEYS, TIME_KEYS, ONCALL_KEYS, PAGE_KEYS, TASK_PAGE_KEYS, GANTT_KEYS,
  FOLDER_KEYS, UI_KEYS, TRIAGE_KEYS, FOLDER_BROWSER_KEYS, CAPTURE_SHEET_KEYS };
const VIEWS = [null, "home", "people", "meetings", "trash", "template", "folder", "task", "plan", "live"];
const WEEK_TABS = ["plan", "timesheet", "settings", "oncall"];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("key hints: keys written as on a keyboard; a label's keys read back", () => {
  assertEqual([" ", "gt", "Escape", "ArrowDown", "S-Enter", "C-n", "a", "?"].map(keyName).join(), "Space,g t,Esc,↓,Shift-Enter,Ctrl-n,a,?");
  assertEqual(capKeys({ keys: ["j", "ArrowDown"], label: "j k" }).join(), "j,k");
  assertEqual(capKeys({ keys: ["ArrowDown"], label: "↑↓" }).join(), "ArrowUp,ArrowDown");
  assertEqual(capKeys({ keys: ["S-Enter"], label: "Shift-Enter" }).join(), "S-Enter");
  assertEqual(capKeys({ keys: ["[", "h"], label: "[ ]" }).join(), "[,]");
  assertEqual(capKeys({ keys: ["gt"] }).join(), "gt");
});

test("key hints: every hint: key is bound in its own table (and scope)", () => {
  for (const [name, table] of Object.entries(TABLES)) {
    for (const entry of table.filter((each) => each.hint)) {
      const bound = new Set(table.filter((each) => each.scope === entry.scope).flatMap((each) => each.keys));
      for (const key of capKeys(entry)) assertTrue(bound.has(key), `${name}: ${entry.action}'s cap names ${JSON.stringify(key)}, which it doesn't bind`);
      assertTrue(entry.help, `${name}: ${entry.action} has its help`);
    }
  }
});

test("key hints: a bar from a table: a cap and its words per hint, in table order", () => {
  assertEqual(hintsOf(TODAY_KEYS).map(({ cap, words }) => `${cap}=${words}`).join(),
    "j k=move,Space=done,s=schedule into next free slot,d=delegate,z=snooze to tomorrow,o=open");
  assertEqual(hintsOf(PAGE_KEYS, { scope: "list" }).map(({ cap }) => cap).join(), "j k,Enter,/,a");
  assertEqual(hintsOf(TIME_KEYS, { without: ["copy"] }).map(({ cap }) => cap).join(), "[ ],t");
  const bar = document.createElement("footer");
  drawKeyHints(bar, hintsOf(TIME_KEYS));
  assertEqual([...bar.querySelectorAll(".key-hints__hint")].map((hint) => `${hint.querySelector(".key").textContent}|${hint.querySelector(".key-hints__label").textContent}`).join(),
    "[ ]|week,t|this week,c|copy the grid");
  const first = bar.firstChild;
  drawKeyHints(bar, hintsOf(TIME_KEYS));
  assertTrue(bar.firstChild === first, "the same hints leave the bar alone");
  drawKeyHints(bar, []);
  assertEqual(bar.children.length, 0);
});

test("view keys: every main-window view's bar ends with ? all keys; Live shows the window's keys", () => {
  const caps = (view, tab) => viewHints(view, tab).map(({ cap }) => cap).join();
  for (const view of VIEWS) assertTrue(caps(view).endsWith("?"), String(view));
  for (const tab of WEEK_TABS) assertTrue(caps("week", tab).endsWith("?"), tab);
  assertEqual(viewHints("live").map(({ cap, words }) => `${cap} ${words}`).join(), "g t Today,g w Week,: command,? all keys");
  const projectCaps = viewHints(null, "plan", { logStatus: true }).map(({ cap }) => cap).join();
  assertEqual(projectCaps, "j k,Enter,z,a,Space,e,L,?", "a project's dashboard: the sections' keys");
  assertEqual(caps(null), "j k,Enter,z,a,Space,e,?", "a person's dashboard: no status to log");
  assertEqual(caps("week", "settings"), "[ ],t,?", "Settings has no grid to copy");
  assertEqual(caps("trash"), "j k,Enter,/,?", "the Trash has no New");
  assertEqual(viewHints("trash").find(({ cap }) => cap === "Enter").words, "restore", "Enter restores in the Trash");
  assertEqual(viewHints("people").find(({ cap }) => cap === "Enter").words, "open");
  assertTrue(!noteHints({ sheet: true }).some(({ cap }) => cap === "?"), "the note window: ? is the editor's");
  assertEqual(noteHints({ sheet: true }).at(-1).cap, "Tab");
  assertTrue(!noteHints().some(({ cap }) => cap === "Tab"), "no sheet, no Tab");
});

test("view keys: a bar shows only keys its view's table binds", () => {
  const check = (view, tab) => {
    const { table } = viewTable(view, tab);
    const bound = new Set([...table, ...MAIN_KEYS].map((entry) => (entry.label ?? keyName(entry.keys[0]))));
    for (const { cap } of viewHints(view, tab)) assertTrue(bound.has(cap), `${view}/${tab}: ${cap}`);
  };
  for (const view of VIEWS) check(view);
  for (const tab of WEEK_TABS) check("week", tab);
});

test("view keys: the ? list leaves out what the bar leaves out", () => {
  const helps = (...args) => viewKeyGroups(...args).flatMap((group) => group.rows.map((row) => row.keys.join()));
  assertTrue(!helps("trash").includes("a"), "the Trash: no New");
  assertTrue(helps("people").includes("a"));
  assertTrue(!helps("week", "settings").includes("c"), "Settings: no grid to copy");
  assertTrue(helps("week", "timesheet").includes("c"));
  assertTrue(!helps(null).includes("L"), "a person's dashboard: no Log status");
  assertTrue(helps(null, "plan", { logStatus: true }).includes("L"));
});

test("view keys: ? is the main window's, never in a text box", () => {
  const event = (target) => ({ key: "?", shiftKey: true, target });
  assertEqual(mainAction(event(document.body)), "keys");
  const input = document.createElement("input");
  document.body.append(input);
  try {
    assertEqual(mainAction(event(input)), null);
  } finally {
    input.remove();
  }
});

test("keys dialog: lists a table as it groups its keys; Escape closes it, the focus goes back", async () => {
  assertEqual(keyGroups(PAGE_KEYS).map((group) => `${group.name}:${group.rows.length}`).join(), "list:11,search:1");
  const groups = viewKeyGroups("people");
  assertEqual(groups.map((group) => group.name).join("|"), "People: The list|People: The search box|Anywhere in this window");
  const row = document.createElement("button");
  document.body.append(row);
  row.focus();
  try {
    const closed = openKeysDialog({ title: "Keys: People", groups });
    const dialog = document.querySelector("dialog.keys-dialog");
    assertTrue(dialog?.open, "open");
    assertEqual(dialog.querySelectorAll(".keys-dialog__group").length, 3);
    assertEqual(dialog.querySelectorAll(".keys-dialog__help").length, PAGE_KEYS.length + MAIN_KEYS.length, "every key with its help");
    const first = dialog.querySelector(".keys-dialog__keys");
    assertEqual([...first.querySelectorAll(".key")].map((cap) => cap.textContent).join(), "j,↓");
    assertTrue(!dialog.querySelector("input, textarea, select"), "read-only");
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await closed;
    await tick();
    assertEqual(document.querySelector("dialog.keys-dialog"), null);
    assertTrue(document.activeElement === row, "the focus is back where it was");
  } finally {
    row.remove();
  }
});

test("note keys: the note window's bar, as Figma has it: the capture leader, then @, :w and Tab", () => {
  assertEqual(noteHints({ sheet: true }).map(({ cap, words }) => `${cap} ${words}`).join(" | "),
    "\\ t line → task | \\ q → question | \\ d → decision | v … \\ t from a selection | \\ u uncapture | @ person | :w save | Tab sheet");
  // Each leader cap is bound in the editor's own table: \t \q \d \u in normal mode, \t on a selection.
  const bound = (table, keys) => table.some((entry) => entry.keys === keys);
  for (const keys of ["\\t", "\\q", "\\d", "\\u"]) assertTrue(bound(NORMAL_KEYS, keys), keys);
  assertTrue(bound(VISUAL_KEYS, "\\t") && bound(NORMAL_KEYS, "v"));
});
