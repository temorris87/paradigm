// The palette: Recent and Pages, notes as you type, commands after ":" with their keys; the
// main window's keys; the recent list.
import { NOTE_COMMANDS } from "../../static/js/notes/commands.js";
import { HUB_KEYS } from "../../static/js/hubs/hub-keys.js";
import { MAIN_KEYS, mainAction } from "../../static/js/layout/main-keys.js";
import { PAGES, commandContext, commandKeys, findCommand, paletteGroups, parseCommand } from "../../static/js/palette/palette-model.js";
import { screenNoteId } from "../../static/js/notes/screen-note.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { MAX_RECENT, recentIds, rememberOpened } from "../../static/js/palette/recent.js";
import { keyReader, resetSequences } from "../../static/js/ui/key-sequence.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const NOTES = [{ id: 1, title: "Event bus migration", detail: "Projects" }, { id: 2, title: "Logging conventions", detail: "Resources" },
  { id: 3, title: "Priya Shah", detail: "People" }];
const KEYS = commandKeys([MAIN_KEYS, HUB_KEYS]);
const groups = (query, more = {}) => paletteGroups({ query, recent: [NOTES[0]], notes: NOTES, commands: NOTE_COMMANDS, keys: KEYS, ...more });
const show = (list) => list.map((group) => `${group.label}: ${group.items.map((item) => item.title).join(", ")}`).join(" | ");

test("palette: with nothing typed, Recent then the Pages with their keys", () => {
  assertEqual(show(groups("")), "Recent: Event bus migration | Pages: Today, Week, Timesheet, On call, Meetings, People, Trash");
  assertEqual(groups("")[1].items.map((item) => item.hint).join(), "gt,gw,,,,,", "a page shows its key; no :command names on screen");
});

test("palette: words find notes, then pages", () => {
  assertEqual(show(groups("peo")), "Notes: Priya Shah | Pages: People");
});

test("palette: a colon lists commands with their usage and key, then notes", () => {
  const list = groups(":log");
  assertEqual(show(list), "Commands: Log status… | Notes: Logging conventions");
  assertEqual(list[0].items[0].hint, ":log[!] L", "L is Log status in the sections' key table");
  const run = groups(":log! now")[0].items[0];
  assertEqual([run.command, run.bang, run.arg].join(), "log,true,now");
  assertTrue(NOTE_COMMANDS.every((command) => command.label), "every command has a label");
  assertTrue(!groups(":")[0].items.some((item) => item.command === "template"), "the main window leaves out note-only commands");
  assertTrue(groups(":", { window: "note" })[0].items.some((item) => item.command === "template"));
  assertEqual(PAGES.length, 7);
  const plan = groups(":plan")[0].items[0];
  assertEqual([plan.title, plan.hint].join(), "Plan (Gantt chart),:plan gp", "the Plan command shows its key");
});

test("palette: commands parse and abbreviate as in Vim", () => {
  assertEqual(JSON.stringify(parseCommand(":task! Call Jo")), JSON.stringify({ name: "task", bang: true, arg: "Call Jo" }));
  assertEqual(findCommand(NOTE_COMMANDS, "cal").name, "calendar");
  assertEqual(findCommand(NOTE_COMMANDS, "ta"), null, ":ta is too short for :task");
});

test("palette: the recent list, newest first, at most 8", () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  for (let id = 1; id <= 10; id += 1) rememberOpened(id, storage);
  rememberOpened(5, storage);
  assertEqual(recentIds(storage).join(), "5,10,9,8,7,6,4,3");
  assertEqual(recentIds(storage).length, MAX_RECENT);
});

test("main keys: : and gt gw gp outside text boxes; a page-wide key clears a list's waiting g", () => {
  const key = (k, target = document.body) => mainAction({ key: k, target, ctrlKey: false, altKey: false, metaKey: false });
  assertEqual(key(":"), "palette");
  assertEqual([key("g"), key("t")].join(), "pending,today");
  assertEqual([key("g"), key("w")].join(), "pending,week");
  assertEqual([key("g"), key("p")].join(), "pending,plan");
  const editor = document.createElement("pd-editor");
  assertEqual(key("g", editor), null, "the editor's own gp (put) is left alone");
  const input = document.createElement("input");
  assertEqual(key(":", input), null, "typing in a box stays typing");
  const read = keyReader([{ keys: ["gg"], action: "first" }, { keys: ["j"], action: "next" }]);
  const list = (k) => read({ key: k, ctrlKey: false, altKey: false, metaKey: false });
  assertEqual(list("g"), "pending");
  resetSequences();
  assertEqual(list("j"), "next", "after gt ran, the list's g is forgotten");
});

test("navigator: the save state says the worst that is true", async () => {
  const { saveStateOf } = await import("../../static/js/layout/navigator-parts.js");
  const key = (state) => saveStateOf(state).text;
  assertEqual([key({}), key({ dirty: true }), key({ dirty: true, saving: true }), key({ dirty: true, failed: true }),
    key({ dirty: true, offline: true }), key({ offline: true }), key({ conflict: true })].join(" | "),
    "Saved | Unsaved | Saving… | Not saved | Offline · kept here | Offline | Changed elsewhere");
});

test("navigator: a project's health dot and stale age; folders count their notes", async () => {
  const { TreeView } = await import("../../static/js/notes/tree-view.js");
  const { NoteTree } = await import("../../static/js/notes/tree-model.js");
  const ul = document.createElement("ul");
  document.body.append(ul);
  try {
    const view = new TreeView(ul, { onOpen() {}, onLeave() {} });
    const tree = new NoteTree([{ id: 1, parent_id: null, title: "Bus", kind: "project" }, { id: 2, parent_id: null, title: "Loose" }]);
    view.show(tree, 2, { health: new Map([[1, { key: "at_risk", stale: true, age: 16 }]]) });
    const row = [...ul.querySelectorAll(".tree__row")].find((node) => node.textContent.includes("Bus"));
    assertTrue(row.querySelector(".tree__health.health--at_risk") !== null);
    assertEqual(row.querySelector(".tree__stale").textContent, "16 d");
    assertTrue(ul.querySelector(".tree__count--pill") !== null, "the Inbox's count is a pill");
  } finally {
    ul.remove();
  }
});

test("palette: the \"on\" label names the note on screen, none on a page with no note", () => {
  const tree = new NoteTree([{ id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 7, parent_id: 2, title: "Kickoff" }]);
  const label = (shown, query = ":tr") => {
    const app = { role: "main", currentId: 2, tree, views: { shown, pages: { live: { state: { id: 7 } } } } };
    const id = screenNoteId(app);
    return commandContext(query, id === null ? null : tree.get(id));
  };
  assertEqual(label(null), "on Acme", "a bare dashboard: its hub");
  assertEqual(label("home"), "", "Today: no hidden hub named");
  assertEqual(label("task"), "");
  assertEqual(label("live"), "on Kickoff", "Live: the Live note");
  assertEqual(label(null, "acme"), "", "no command typed: no label");
});
