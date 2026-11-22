import { HUB_KEYS, hubAction } from "../../static/js/hubs/hub-keys.js";
import { archivedProjectsIn, areaOf, projectsIn } from "../../static/js/hubs/hub-areas.js";
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { stepSize } from "../../static/js/hubs/hub-size.js";
import { HUB_TABS, dayOf, tabsFor } from "../../static/js/hubs/hub-tabs.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { isHub } from "../../static/js/notes/hub-groups.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Acme", kind: "project", area_id: 1, updated_at: "2026-11-01T12:00:00.000Z" },
  { id: 3, parent_id: 2, title: "Kickoff", updated_at: "2026-11-02T12:00:00.000Z" },
  { id: 4, parent_id: 3, title: "Minutes", updated_at: "2026-11-20T12:00:00.000Z" },
  { id: 5, parent_id: 2, title: "Budget", updated_at: T },
  { id: 6, parent_id: null, title: "Northwind", kind: "project", area_id: 1, updated_at: T },
  { id: 7, parent_id: null, title: "Manuals", kind: "resource", updated_at: T },
  { id: 8, parent_id: null, title: "Loose", updated_at: T },
  { id: 9, parent_id: null, title: "Solo", kind: "project", area_id: 7, updated_at: T },
];
const tree = () => new NoteTree(NOTES);
const tab = (key) => HUB_TABS.find((each) => each.key === key);

test("hubs: only top-level notes with a kind are hubs", () => {
  const t = tree();
  assertEqual([1, 2, 3, 7, 8].map((id) => isHub(t, id)).join(), "true,true,false,true,false");
});

test("hubs: a project's area, an area's projects; a non-area target counts as none", () => {
  const t = tree();
  assertEqual(areaOf(t, 2).title, "Operations");
  assertEqual(areaOf(t, 9), null, "area_id points at a resource");
  assertEqual(areaOf(t, 1), null, "an area has no area");
  assertEqual(projectsIn(t, 1).map((n) => n.title).join(), "Acme,Northwind");
  // A trashed area is not in the tree: its projects show no area.
  assertEqual(areaOf(new NoteTree(NOTES.filter((n) => n.id !== 1)), 2), null);
});

test("hub tabs: Notes first on hubs and people; People on hubs; Projects only on areas; Hubs on people", () => {
  assertEqual(tabsFor({ kind: "area" }).map((t) => t.label).join(), "Notes,People,Projects,Meetings,Decisions,Questions");
  assertEqual(tabsFor({ kind: "project" }).map((t) => t.label).join(), "Notes,People,Meetings,Decisions,Questions");
  assertEqual(tabsFor({ kind: "resource" }).map((t) => t.label).join(), "Notes,People,Meetings,Decisions,Questions,Linked from");
  assertEqual(tabsFor({ kind: "person" }).map((t) => t.label).join(), "Notes,Hubs,Meetings,Decisions,Questions");
  assertEqual(tabsFor({ kind: "meeting" }).map((t) => t.label).join(), "Attendees,Notes,Decisions,Questions");
  assertEqual(tabsFor({ kind: null }).length, 0);
});

test("hub tabs: Notes lists the whole subtree in tree order with depths", () => {
  const t = tree();
  const rows = tab("notes").rows({ tree: t }, t.get(2));
  assertEqual(rows.map((r) => `${r.title}:${r.depth}`).join(), "Budget:0,Kickoff:0,Minutes:1");
  assertEqual(rows[0].detail, dayOf(T));
  assertEqual(tab("notes").empty(t.get(7)), "No notes in this resource yet (:child {title} makes one)");
});

test("hub tabs: Projects counts notes and takes the latest change inside", () => {
  const t = tree();
  const rows = tab("projects").rows({ tree: t }, t.get(1));
  assertEqual(rows.map((r) => r.title).join(), "Acme,Northwind");
  assertEqual(rows[0].detail, `3 notes · ${dayOf(T)}`);
  assertEqual(rows[1].detail, `0 notes · ${dayOf(T)}`);
  assertEqual(dayOf(""), "");
  assertEqual(dayOf("nonsense"), "");
});

test("hub size: three steps, stopping at the ends", () => {
  assertEqual(stepSize("open", -1), "collapsed");
  assertEqual(stepSize("collapsed", -1), "collapsed");
  assertEqual(stepSize("open", 1), "expanded");
  assertEqual(stepSize("expanded", 1), "expanded");
});

test("hub keys: one table, Tab never bound, modifiers left to the browser", () => {
  const all = HUB_KEYS.flatMap((entry) => entry.keys);
  assertEqual(new Set(all).size, all.length, "no key bound twice");
  assertTrue(!all.includes("Tab"));
  assertEqual(hubAction({ key: "j" }), "next");
  assertEqual(hubAction({ key: "3" }), "tabNumber");
  assertEqual(hubAction({ key: "j", ctrlKey: true }), null);
  assertEqual(hubAction({ key: "x" }), null);
});

test("note commands: :inarea and :hub, typed in full", () => {
  const calls = [];
  const app = { inAreaCommand: (arg) => calls.push(`inarea ${arg}`), hubCommand: () => calls.push("hub") };
  runNoteCommand(app, { name: "inarea", arg: "Operations" });
  runNoteCommand(app, { name: "hub" });
  assertEqual(calls.join(), "inarea Operations,hub");
  assertEqual(NOTE_COMMANDS.find((c) => c.name === "inarea").min, 6);
  assertEqual(NOTE_COMMANDS.find((c) => c.name === "hub").min, 3);
});

// ---- the page (DOM) ---------------------------------------------------------------------

const STORE = ["paradigm.hub.size", "paradigm.hub.tabs"];

function withPage(body) {
  STORE.forEach((key) => localStorage.removeItem(key));
  const page = document.createElement("main");
  const line = document.createElement("div");
  const editor = document.createElement("textarea");
  editor.className = "app__editor";
  const section = document.createElement("section");
  page.append(line, editor, section);
  document.body.append(page);
  const opened = [];
  let left = 0;
  const hub = new HubPage({ page, line, section, onOpen: (id) => opened.push(id), onLeave: () => { left += 1; } });
  try {
    body({ page, line, section, editor, hub, opened, left: () => left });
  } finally {
    page.remove();
    STORE.forEach((key) => localStorage.removeItem(key));
  }
}

const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const rowTitles = (section) => [...section.querySelectorAll(".hub__title")].map((n) => n.textContent).join(",");
const activeTitle = (section) => section.querySelector("[role=option][aria-selected=true] .hub__title")?.textContent;
const tabLabels = (section) => [...section.querySelectorAll("[role=tab]")].map((n) => n.textContent + (n.getAttribute("aria-selected") === "true" ? "*" : "")).join(",");

test("hub page: shows only on a hub, with its line", () => withPage(({ page, line, section, hub }) => {
  hub.show({ tree: tree() }, 8);
  assertTrue(section.hidden && line.hidden, "an Inbox note has no hub page");
  assertEqual(page.dataset.hubSize, undefined);
  hub.show({ tree: tree() }, 3);
  assertTrue(section.hidden, "a nested note has no hub page");
  hub.show({ tree: tree() }, 2);
  assertTrue(!section.hidden && !line.hidden);
  assertEqual(page.dataset.hubSize, "open");
  assertEqual(line.textContent, "Project·Area: Operations");
  hub.show({ tree: tree() }, 1);
  assertEqual(line.textContent, "Area·2 projects");
  hub.show({ tree: tree() }, 7);
  assertEqual(line.textContent, "Resource");
  hub.show({ tree: tree() }, 9);
  assertEqual(line.textContent, "Project·no area (:inarea {area})");
}));

test("hub page: the area on the hub line opens it", () => withPage(({ line, hub, opened }) => {
  hub.show({ tree: tree() }, 2);
  line.querySelector("button").click();
  assertEqual(opened.join(), "1");
}));

test("hub page: j k g G move, Enter opens, Escape leaves", () => withPage(({ section, hub, opened, left }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  assertEqual(rowTitles(section), "Budget,Kickoff,Minutes");
  assertEqual(activeTitle(section), "Budget");
  press("j");
  press("j");
  press("j");
  assertEqual(activeTitle(section), "Minutes", "j stops at the last row");
  press("k");
  assertEqual(activeTitle(section), "Kickoff");
  press("G");
  assertEqual(activeTitle(section), "Minutes");
  press("g");
  press("Enter");
  assertEqual(opened.join(), "5");
  press("Escape");
  assertEqual(left(), 1);
}));

test("hub page: tabs by h l and number, remembered per hub", () => withPage(({ section, hub }) => {
  hub.show({ tree: tree() }, 1);
  hub.focus();
  assertEqual(tabLabels(section), "Notes*,People,Projects,Meetings,Decisions,Questions");
  assertEqual(section.querySelector(".hub__empty").textContent, "No notes in this area yet (:child {title} makes one)");
  press("l");
  assertEqual(tabLabels(section), "Notes,People*,Projects,Meetings,Decisions,Questions");
  press("l");
  assertEqual(tabLabels(section), "Notes,People,Projects*,Meetings,Decisions,Questions");
  assertEqual(rowTitles(section), "Acme,Northwind");
  for (let i = 0; i < 4; i += 1) press("l");
  assertEqual(tabLabels(section), "Notes,People,Projects,Meetings,Decisions,Questions*", "l stops at the last tab");
  press("1");
  assertEqual(tabLabels(section), "Notes*,People,Projects,Meetings,Decisions,Questions");
  press("3");
  hub.show({ tree: tree() }, 2);
  assertEqual(tabLabels(section), "Notes*,People,Meetings,Decisions,Questions");
  hub.show({ tree: tree() }, 1);
  assertEqual(tabLabels(section), "Notes,People,Projects*,Meetings,Decisions,Questions", "the area's tab came back");
  section.querySelector("[role=tab]").click();
  assertEqual(tabLabels(section), "Notes*,People,Projects,Meetings,Decisions,Questions", "a click picks a tab");
}));

test("hub page: - and + step the size; expanded hides the editor; Escape reopens", () => withPage(({ page, section, hub, left }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  press("-");
  assertEqual(page.dataset.hubSize, "collapsed");
  assertTrue(section.querySelector(".hub__list").hidden, "collapsed: only the tab row");
  assertTrue(section.contains(document.activeElement), "the focus stays in the panel");
  press("+");
  press("=");
  assertEqual(page.dataset.hubSize, "expanded");
  assertTrue(hub.editorHidden);
  assertEqual(localStorage.getItem("paradigm.hub.size"), '"expanded"');
  press("Escape");
  assertEqual(page.dataset.hubSize, "open");
  assertEqual(left(), 1);
}));

test("hub page: :hub on a collapsed panel opens it; size buttons pick a size", () => withPage(({ page, section, hub }) => {
  hub.show({ tree: tree() }, 2);
  section.querySelector('.hub__size[data-size="collapsed"]').click();
  assertEqual(page.dataset.hubSize, "collapsed");
  hub.focus();
  assertEqual(page.dataset.hubSize, "open");
  assertEqual(document.activeElement, section.querySelector(".hub__list"));
  section.querySelector('.hub__size[data-size="expanded"]').click();
  assertEqual(page.dataset.hubSize, "expanded");
  assertEqual(section.querySelector('[aria-pressed="true"]').dataset.size, "expanded");
}));

test("hub page: a redraw of the same hub keeps the row; a click on a row opens it", () => withPage(({ section, hub, opened }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  press("j");
  hub.show({ tree: tree() }, 2);
  assertEqual(activeTitle(section), "Kickoff");
  section.querySelectorAll("[role=option]")[2].click();
  assertEqual(opened.join(), "4");
}));

// ---- archived hubs -----------------------------------------------------------------------

const A = "2026-11-15T12:00:00.000Z";
const WITH_ARCHIVED = [
  ...NOTES,
  { id: 10, parent_id: null, title: "Zeta", kind: "project", area_id: 1, archived_at: A, updated_at: T },
];

test("hubs: an area's archived projects are apart from its active ones", () => {
  const t = new NoteTree(WITH_ARCHIVED);
  assertEqual(projectsIn(t, 1).map((n) => n.title).join(), "Acme,Northwind");
  assertEqual(archivedProjectsIn(t, 1).map((n) => n.title).join(), "Zeta");
  const archivedArea = new NoteTree(NOTES.map((n) => (n.id === 1 ? { ...n, archived_at: A } : n)));
  assertEqual(areaOf(archivedArea, 2).title, "Operations", "an archived area is still the project's area");
});

test("hub tabs: archived projects come last, muted", () => {
  const t = new NoteTree(WITH_ARCHIVED);
  const rows = tab("projects").rows({ tree: t }, t.get(1));
  assertEqual(rows.map((r) => `${r.title}${r.muted ? "~" : ""}`).join(), "Acme,Northwind,Zeta~");
  assertEqual(rows[2].detail, `archived ${dayOf(A)}`);
});

test("hub page: an archived hub says so; an archived area is muted on its projects", () => withPage(({ line, section, hub }) => {
  const t = new NoteTree(WITH_ARCHIVED);
  hub.show({ tree: t }, 10);
  assertEqual(line.textContent, "Archived·Project·Area: Operations");
  hub.show({ tree: t }, 1);
  assertEqual(line.textContent, "Area·2 projects", "the count leaves archived projects out");
  const archivedArea = new NoteTree(NOTES.map((n) => (n.id === 1 ? { ...n, archived_at: A } : n)));
  hub.show({ tree: archivedArea }, 2);
  assertEqual(line.textContent, "Project·Area: Operations(archived)");
  assertTrue(line.querySelector(".hub-line__link--archived") !== null);
  hub.show({ tree: t }, 1);
  hub.selectTab(2);
  assertTrue(section.querySelector(".hub__row--muted .hub__title").textContent === "Zeta");
}));
