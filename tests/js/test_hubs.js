import { HUB_KEYS, hubAction, keysFor } from "../../static/js/hubs/hub-keys.js";
import { archivedProjectsIn, areaOf, projectsIn } from "../../static/js/hubs/hub-areas.js";
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { DASHBOARD_LAYOUT, HUB_SECTIONS, dashboardFor, dayOf, sectionsFor } from "../../static/js/hubs/hub-sections.js";
import { fieldsFor } from "../../static/js/hubs/fields.js";
import { showHubLine } from "../../static/js/hubs/hub-line.js";
import { dueText, isOverdue, statusText } from "../../static/js/hubs/project-facts.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { isHub } from "../../static/js/notes/hub-groups.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Files } from "../../static/js/files/files-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Acme", kind: "project", area_id: 1, status: "active", due: "", updated_at: "2026-11-01T12:00:00.000Z" },
  { id: 3, parent_id: 2, title: "Kickoff", updated_at: "2026-11-02T12:00:00.000Z" },
  { id: 4, parent_id: 3, title: "Minutes", updated_at: "2026-11-20T12:00:00.000Z" },
  { id: 5, parent_id: 2, title: "Budget", updated_at: T },
  { id: 6, parent_id: null, title: "Northwind", kind: "project", area_id: 1, status: "on_hold", due: "2026-11-01", updated_at: T },
  { id: 7, parent_id: null, title: "Manuals", kind: "resource", updated_at: T },
  { id: 8, parent_id: null, title: "Loose", updated_at: T },
  { id: 9, parent_id: null, title: "Solo", kind: "project", area_id: 7, status: "active", due: "", updated_at: T },
];
const tree = () => new NoteTree(NOTES);
const section = (key) => HUB_SECTIONS.find((each) => each.key === key);
const TODAY = new Date(2026, 10, 22);

test("hubs: only top-level notes with a kind are hubs", () => {
  const t = tree();
  assertEqual([1, 2, 3, 7, 8].map((id) => isHub(t, id)).join(), "true,true,false,false,false", "a resource is a plain note");
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

test("hub sections: each kind's sections, top to bottom", () => {
  const keys = (kind) => sectionsFor({ kind }).map((each) => each.key).join();
  assertEqual(keys("project"), "plan,tasks,questions,decisions,meetings,files,notes,people");
  assertEqual(keys("area"), "projects,tasks,questions,decisions,meetings,files,templates,notes,people");
  assertEqual(keys("resource"), "tasks,files", "a resource: as a plain note");
  assertEqual(keys("meeting"), "tasks,questions,decisions,files");
  assertEqual(keys("person"), "waiting,owe,raise,active,archived,backlinks");
  assertEqual(keys(null), "tasks,files", "a plain note: its tasks and files");
  assertEqual(sectionsFor({ kind: "decision" }).length, 0);
});

test("fields: each page labels its text boxes", () => {
  assertEqual(fieldsFor({ kind: "project" }).main.label, "Outcome");
  assertEqual(fieldsFor({ kind: "area" }).main.label, "Purpose");
  assertEqual(fieldsFor({ kind: "meeting" }).agenda.label, "Agenda");
  assertEqual(fieldsFor({ kind: "meeting" }).main.label, "Notes");
  assertEqual(fieldsFor({ kind: "decision" }).main.label, "Why");
  assertEqual(fieldsFor({ kind: "question" }).main.label, "Answer");
  assertEqual(fieldsFor({ kind: null }).main.label, "Notes");
  assertTrue(fieldsFor({ kind: null }, true).main.hint.includes("right-click"), "a note in a hub hints at the menu");
  assertEqual(fieldsFor({ kind: null }, false).main.hint, "");
});

test("hub sections: Notes lists the whole subtree in tree order with depths", () => {
  const t = tree();
  const rows = section("notes").rows({ tree: t }, t.get(2));
  assertEqual(rows.map((r) => `${r.title}:${r.depth}`).join(), "Budget:0,Kickoff:0,Minutes:1");
  assertEqual(rows[0].date, "21 Nov", "the day it changed, in the date column");
  assertEqual(rows[0].detail, "");
  assertEqual(section("notes").empty(t.get(1)), "No notes in this area yet");
  assertEqual(dayOf(""), "");
  assertEqual(dayOf("nonsense"), "");
});

test("hub sections: an area's projects say on hold and overdue, muted when on hold", () => {
  const t = tree();
  const rows = section("projects").rows({ tree: t, today: TODAY }, t.get(1));
  assertEqual(rows.map((r) => `${r.title}${r.muted ? "~" : ""}`).join(), "Acme,Northwind~");
  assertEqual(rows[1].detail, "on hold · overdue since Sun 1 Nov");
  assertEqual(section("projects").detail(rows), "1 live");
});

test("project facts: status and due texts", () => {
  assertEqual(statusText({ status: "on_hold" }), "on hold");
  assertEqual(statusText({ status: "active" }), "");
  assertEqual(dueText({ due: "2026-12-15" }, TODAY), "due Tue 15 Dec");
  assertTrue(isOverdue({ due: "2026-11-21" }, TODAY));
  assertTrue(!isOverdue({ due: "2026-11-22" }, TODAY), "due today is not overdue");
  assertEqual(dueText({ due: "" }, TODAY), "");
});

test("hub keys: one table, Tab bound only on a person, modifiers left to the browser", () => {
  for (const page of [null, "project", "person"]) {
    const all = keysFor(page).flatMap((entry) => entry.keys);
    assertEqual(new Set(all).size, all.length, `no key bound twice on ${page}`);
  }
  assertTrue(!keysFor("project").flatMap((entry) => entry.keys).includes("Tab"));
  assertTrue(HUB_KEYS.filter((entry) => entry.keys.includes("Tab")).every((entry) => entry.page === "person"));
  assertEqual(hubAction({ key: "Tab" }), null, "Tab moves the focus on");
  assertEqual(hubAction({ key: "Tab" }, "person"), "nextColumn");
  assertEqual(hubAction({ key: "Tab", shiftKey: true }, "person"), "previousColumn");
  assertEqual(hubAction({ key: "a" }, "person"), "addTopic");
  assertEqual(hubAction({ key: "a" }), "add");
  assertEqual(hubAction({ key: "r" }, "person"), "raised");
  assertEqual(hubAction({ key: "n" }, "person"), "oneOnOne");
  assertEqual(hubAction({ key: "n" }), null, "n is the person's only");
  assertEqual(hubAction({ key: "o" }, "person"), "openRow");
  assertEqual(hubAction({ key: "j" }), "next");
  assertEqual(hubAction({ key: "}" }), "nextSection");
  assertEqual(hubAction({ key: "z" }), "fold");
  assertEqual(hubAction({ key: "j", ctrlKey: true }), null);
  assertEqual(hubAction({ key: "x" }), "remove");
  assertEqual(hubAction({ key: "r" }), "second");
  assertEqual(hubAction({ key: "q" }), null);
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

const STORE = ["paradigm.hub.folds"];

function withPage(body, { tabActions, hideSections = ["plan", "files"] } = {}) {
  STORE.forEach((key) => localStorage.removeItem(key));
  const page = document.createElement("main");
  const line = document.createElement("div");
  const main = document.createElement("div");
  const editor = document.createElement("textarea");
  editor.className = "app__editor";
  const section = document.createElement("section");
  page.append(line, main, editor, section);
  document.body.append(page);
  const opened = [];
  let left = 0;
  const hub = new HubPage({ page, line, section, labels: { main }, onOpen: (id, at) => opened.push(at ? `${id}@${at.line}` : id),
    onLeave: () => { left += 1; }, hideSections, ...(tabActions ? { tabActions } : {}) });
  try {
    body({ page, line, main, section, editor, hub, opened, left: () => left });
  } finally {
    page.remove();
    STORE.forEach((key) => localStorage.removeItem(key));
  }
}

const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const rowTitles = (section) => [...section.querySelectorAll(".hub__title")].map((n) => n.textContent).join(",");
const headings = (section) => [...section.querySelectorAll(".hub__heading")]
  .map((n) => `${n.querySelector(".hub__label").textContent}${n.getAttribute("aria-expanded") === "false" ? "+" : ""}`).join(",");
const empties = (section) => [...section.querySelectorAll(".hub__empty-label")].map((n) => n.textContent).join(",");
const active = (section) => {
  const node = section.querySelector("[role=option][aria-selected=true]");
  return node?.querySelector(".hub__title, .hub__label, .hub__empty-label")?.textContent ?? node?.textContent;
};
const rows = (line) => [...line.querySelectorAll(".hub-line__row")].map((row) => row.textContent);

const hubTask = (id, noteId, title) => ({ id, note_id: noteId, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, snoozed_until: "", estimate_min: null });

test("hub page: the first task is selected first, even when the tasks arrive after the first draw", () => withPage(({ section, hub }) => {
  hub.show({ tree: tree(), today: TODAY }, 9);
  hub.show({ tree: tree(), today: TODAY, tasks: new Tasks([hubTask(1, 9, "Solo one")]) }, 9);
  assertEqual(active(section), "Solo one", "the tasks came in later");
  hub.show({ tree: tree(), today: TODAY, tasks: new Tasks([hubTask(2, 2, "Acme first"), hubTask(3, 2, "Acme second")]) }, 2);
  assertEqual(active(section), "Acme first", "another hub starts on its own first task");
  section.querySelector("#hub-list").focus();
  press("j");
  hub.show({ tree: tree(), today: TODAY, tasks: new Tasks([hubTask(2, 2, "Acme first"), hubTask(3, 2, "Acme second")]) }, 2);
  assertEqual(active(section), "Acme second", "once moved, a redraw keeps the row");
}));

test("hub page: shows only on a hub, a person or a meeting; labels the text box", () => withPage(({ page, line, main, section, hub }) => {
  hub.show({ tree: tree() }, 8);
  assertTrue(!section.hidden && line.hidden, "an Inbox note has no card, only its Tasks");
  assertEqual(headings(section), "", "an empty section has no heading of its own");
  assertEqual(empties(section), "Tasks", "it is on the Nothing yet line");
  assertEqual(page.dataset.page, "note");
  assertEqual(main.textContent, "Notes");
  hub.show({ tree: tree() }, 3);
  assertTrue(!section.hidden && line.hidden, "a nested note: its Tasks, no card");
  assertTrue(main.textContent.startsWith("Notes"), "a note in a hub hints at the menu");
  hub.show({ tree: tree(), today: TODAY }, 2);
  assertTrue(!section.hidden && !line.hidden);
  assertEqual(page.dataset.page, "project");
  assertEqual(main.querySelector(".field-label__name").textContent, "Outcome");
  assertEqual(headings(section), "Notes");
  assertEqual(empties(section), "Tasks,Questions,Decisions,Meetings,People", "the empty ones, in their order, on one line");
  assertEqual(rows(line)[0], "Project▾·Active▾·Set due date·Area: Operations✎·Set time code");
  assertEqual(rows(line)[1], "People:no one yet+ Add person");
  hub.show({ tree: tree() }, 1);
  assertEqual(rows(line)[0], "Area▾·1 live project·1 on hold·0 people·Set time code");
  hub.show({ tree: tree() }, 7);
  assertTrue(line.hidden, "a resource has no card: it is a plain note");
  hub.show({ tree: tree(), today: TODAY }, 6);
  assertEqual(rows(line)[0], "Project▾·On hold▾·overdue since Sun 1 Nov·Area: Operations✎·Set time code");
  assertTrue(line.querySelector(".hub-line__when--late") !== null);
  hub.show({ tree: tree() }, 9);
  assertEqual(rows(line)[0], "Project▾·Active▾·Set due date·no areaSet area·Set time code");
}));

test("hub page: the area on the card opens it", () => withPage(({ line, hub, opened }) => {
  hub.show({ tree: tree() }, 2);
  line.querySelector(".hub-line__link").click();
  assertEqual(opened.join(), "1");
}));

test("hub page: j k gg G move over headings and rows, Enter opens, Escape leaves", () => withPage(({ section, hub, opened, left }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  assertEqual(rowTitles(section), "Budget,Kickoff,Minutes");
  assertEqual(active(section), "Notes");
  press("j");
  assertEqual(active(section), "Budget");
  press("j");
  press("j");
  press("j");
  assertEqual(active(section), "Tasks", "j goes on to the empty sections' line");
  press("k");
  assertEqual(active(section), "Minutes");
  press("{");
  assertEqual(active(section), "Notes", "{ goes to the section's own heading first");
  press("G");
  assertEqual(active(section), "People");
  press("g");
  assertEqual(active(section), "People", "g waits for its second key");
  press("g");
  assertEqual(active(section), "Notes");
  press("j");
  press("Enter");
  assertEqual(opened.join(), "5");
  press("Escape");
  assertEqual(left(), 1);
}));

test("hub page: Enter or z on a heading folds it; folds are remembered per kind", () => withPage(({ section, hub }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  press("Enter");
  assertEqual(headings(section), "Notes+");
  assertEqual(rowTitles(section), "", "a folded section shows no rows");
  assertEqual(active(section), "Notes", "the heading stays active");
  assertEqual(JSON.parse(localStorage.getItem("paradigm.hub.folds"))["project:notes"], true);
  hub.show({ tree: tree() }, 9);
  assertEqual(headings(section), "", "another project's Notes, empty: on the Nothing yet line, folded or not");
  hub.show({ tree: tree() }, 2);
  assertEqual(headings(section), "Notes+", "the fold is remembered per kind");
  hub.focus();
  press("g");
  press("g");
  press("z");
  assertEqual(headings(section), "Notes");
  assertEqual(JSON.parse(localStorage.getItem("paradigm.hub.folds"))["project:notes"], false);
}));

test("hub page: a Files section's folders sit outside its limit; heading and Show all count files", () => withPage(({ section, hub }) => {
  const folders = [1, 2, 3].map((id) => ({ id, note_id: 1, path: `/od/F${id}`, name: `F${id}` }));
  const names = Array.from({ length: 10 }, (_, i) => `f${String(i).padStart(2, "0")}.xlsx`);
  const files = new Files({ folders, files: names.map((name, i) => ({ id: i + 1, folder_id: 1, rel_path: name, name, missing: false })),
    links: names.map((_, i) => ({ file_id: i + 1, note_id: 1 })) });
  hub.show({ tree: tree(), files }, 1);
  const filesSection = () => section.querySelector(".hub__section--files");
  const shownRows = () => [...filesSection().querySelectorAll(".hub__row .hub__title")].map((n) => n.textContent);
  assertEqual(shownRows().filter((t) => t.startsWith("📁")).length, 3, "every folder shown");
  assertEqual(shownRows().filter((t) => !t.startsWith("📁")).length, 8, "the limit's 8 files, not 8 rows");
  assertEqual(filesSection().querySelector(".hub__count").textContent, "10");
  const more = filesSection().querySelector(".hub__more");
  assertEqual(more.textContent, "Show all (10)", "the same count as the heading");
  more.click();
  assertEqual(shownRows().length, 13);
}, { hideSections: ["plan"] }));

test("hub page: a section past its limit shows Show all", () => withPage(({ section, hub }) => {
  const many = [...NOTES, ...Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, parent_id: 2, title: `Q${i}` }))];
  const records = { get: (id) => ({ id, kind: "question", day: `2026-11-0${(id % 9) + 1}`, people: [], answered: "", source_id: null }), all: () => [] };
  const t = new NoteTree(many.map((n) => (n.id >= 100 ? { ...n, kind: "question" } : n)));
  hub.show({ tree: t, records }, 2);
  assertEqual(section.querySelectorAll(".hub__section--questions .hub__row").length, 5);
  const more = section.querySelector(".hub__more");
  assertEqual(more.textContent, "Show all (7)");
  more.click();
  assertEqual(section.querySelectorAll(".hub__section--questions .hub__row").length, 7);
  assertEqual(section.querySelector(".hub__section--questions .hub__count").textContent, "7 open");
}));

test("hub page: a redraw of the same hub keeps the active row; a click on a row opens it", () => withPage(({ section, hub, opened }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  press("j");
  press("j");
  hub.show({ tree: tree() }, 2);
  assertEqual(active(section), "Kickoff");
  [...section.querySelectorAll(".hub__row")].find((row) => row.textContent.startsWith("Minutes")).click();
  assertEqual(opened.join(), "4");
}));

// ---- archived hubs -----------------------------------------------------------------------

const A = "2026-11-15T12:00:00.000Z";
const WITH_ARCHIVED = [
  ...NOTES,
  { id: 10, parent_id: null, title: "Zeta", kind: "project", area_id: 1, archived_at: A, status: "active", due: "", updated_at: T },
];

test("hubs: an area's archived projects are apart from its active ones", () => {
  const t = new NoteTree(WITH_ARCHIVED);
  assertEqual(projectsIn(t, 1).map((n) => n.title).join(), "Acme,Northwind");
  assertEqual(archivedProjectsIn(t, 1).map((n) => n.title).join(), "Zeta");
  const archivedArea = new NoteTree(NOTES.map((n) => (n.id === 1 ? { ...n, archived_at: A } : n)));
  assertEqual(areaOf(archivedArea, 2).title, "Operations", "an archived area is still the project's area");
});

test("hub sections: archived projects come last, muted", () => {
  const t = new NoteTree(WITH_ARCHIVED);
  const projectRows = section("projects").rows({ tree: t, today: TODAY }, t.get(1));
  assertEqual(projectRows.map((r) => `${r.title}${r.muted ? "~" : ""}`).join(), "Acme,Northwind~,Zeta~");
  assertEqual(projectRows[2].detail, "archived");
  assertEqual(projectRows[2].date, "15 Nov");
});

test("hub page: an archived hub says so; an archived area is muted on its projects", () => withPage(({ line, hub }) => {
  const t = new NoteTree(WITH_ARCHIVED);
  hub.show({ tree: t }, 10);
  assertTrue(rows(line)[0].startsWith("Archived·Project▾"));
  const archivedArea = new NoteTree(NOTES.map((n) => (n.id === 1 ? { ...n, archived_at: A } : n)));
  hub.show({ tree: archivedArea }, 2);
  assertTrue(rows(line)[0].endsWith("Area: Operations(archived)✎·Set time code"));
  assertTrue(line.querySelector(".hub-line__link--archived") !== null);
}));

test("hub card: its buttons call the controls with the hub", () => {
  const line = document.createElement("div");
  const calls = [];
  const controls = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args.filter((arg) => arg?.id).map((arg) => arg.id)]) });
  const ctx = { tree: tree(), people: { get: () => ({ hubs: [] }) }, meetings: { get: () => ({}) }, records: { all: () => [] } };
  showHubLine(line, ctx, tree().get(2), () => {}, controls);
  line.querySelector(".hub-line__kind").click();
  line.querySelector(".hub-line__state").click();
  line.querySelector("[aria-label='Change the area']").click();
  [...line.querySelectorAll(".hub-line__set")].find((b) => b.textContent === "Set due date").click();
  [...line.querySelectorAll(".hub-line__set")].find((b) => b.textContent === "+ Add person").click();
  assertEqual(calls.map((call) => call.join(":")).join(), "file:2,status:2,area:2,due:2,addPerson:2");
});

test("hub sections: add buttons; link rows can be changed", () => {
  const withAdd = HUB_SECTIONS.filter((each) => each.add).map((each) => each.key).join();
  assertEqual(withAdd, "where,digest,projects,questions,openQuestions,plan,milestones,tasks,owe,raise,waiting,personNotes,together,files,templates,decisions,notes,meetings,upcomingMeetings,people,active");
  const projectRows = section("projects").rows({ tree: tree(), today: TODAY }, tree().get(1));
  assertEqual(projectRows.map((row) => row.actions.map((action) => action.key).join("+")).join(), "remove,remove");
});

test("hub page: a adds in the section, x and r work only on rows offering them", () => {
  const calls = [];
  const tabActions = { add: (key, hub) => calls.push(`add ${key} ${hub.id}`), row: (key, sectionKey, hub, row) => calls.push(`${key} ${sectionKey} ${row.id}`) };
  withPage(({ section, hub }) => {
    hub.show({ tree: tree(), today: TODAY }, 1);
    hub.focus();
    press("a");
    assertEqual(calls.join("|"), "add projects 1", "a on the Projects heading");
    press("j");
    press("x");
    press("r");
    assertEqual(calls.join("|"), "add projects 1|remove projects 2", "a project row has no second button");
    press("G");
    press("x");
    assertEqual(calls.length, 2, "an empty section's item has no Remove");
    press("a");
    assertEqual(calls.pop(), "add people 1", "a on an empty section's item adds there");
    [...section.querySelectorAll(".hub__empty-item")].find((n) => n.textContent.startsWith("Notes")).querySelector("[data-action=add]").click();
    assertEqual(calls.pop(), "add notes 1");
    section.querySelector("[data-action=remove]").click();
    assertEqual(calls.pop(), "remove projects 2");
  }, { tabActions });
});

// ---- the main window's dashboard: two lanes ---------------------------------------------

test("dashboard: every lane's section is in the table; a project's and an area's lanes", () => {
  const keys = new Set(HUB_SECTIONS.map((each) => each.key));
  for (const [kind, lanes] of Object.entries(DASHBOARD_LAYOUT)) {
    for (const key of [...(lanes.wide ?? []), ...(lanes.cards ?? []), ...lanes.act, ...lanes.know]) assertTrue(keys.has(key), `${kind}: ${key}`);
  }
  const lanes = (kind) => Object.values(dashboardFor({ kind })).map((lane) => lane.map((each) => each.key).join()).join(" | ");
  assertEqual(lanes("project"), " |  | where,tasks,openQuestions | meetings,decisions,answeredQuestions,notes,files,people");
  assertEqual(lanes("person"), " | waiting,owe,raise | personNotes | together,togetherBacklinks,togetherArchived");
  assertTrue(lanes("area").startsWith("projects |  | portfolio,"), "an area's Projects come first, across both lanes");
  assertEqual(dashboardFor({ kind: "meeting" }), null, "the note window's single list for the rest");
  assertTrue(!lanes("project").includes("plan"), "the chart shows the plan");
});

test("dashboard: an area's Projects as a table: health, latest status, updated, milestone, open", () => {
  const rows = section("projects").rows({ tree: tree(), today: TODAY }, tree().get(1));
  assertEqual(rows.map((row) => row.cells.join("|")).join(" / "), "—|log one||| / On hold|log one|||");
  assertEqual(rows[0].cellClasses.slice(0, 2).join(), "health health--none,hub__cell--action");
  assertEqual(section("projects").columns.length, rows[0].cells.length);
  assertEqual(section("projects").columns.join(), "Health,Latest status,Updated,Next milestone,Open");
  assertEqual(rows[0].cellClasses.length, 5);
});

test("dashboard: two lanes; arrows cross between them; split sections act as their base", () => {
  const calls = [];
  const tabActions = { add: (key, hub) => calls.push(`add ${key} ${hub.id}`), row: () => {} };
  STORE.forEach((key) => localStorage.removeItem(key));
  const page = document.createElement("main");
  const section = document.createElement("section");
  page.append(section);
  document.body.append(page);
  try {
    const hub = new HubPage({ page, line: document.createElement("div"), section, onOpen: () => {}, onLeave: () => {},
      dashboard: true, tabActions });
    hub.show({ tree: tree(), today: TODAY }, 2);
    const lanes = [...section.querySelectorAll(".hub__lane")];
    assertEqual(lanes.length, 2);
    assertEqual(empties(lanes[0]), "Where I am,Tasks,Open questions");
    assertEqual(headings(lanes[1]), "Notes", "Know: Notes has rows; folded ones keep a heading");
    hub.focus();
    assertEqual(active(section), "Where I am");
    press("ArrowRight");
    assertEqual(active(section), "Notes");
    press("ArrowLeft");
    assertEqual(active(section), "Where I am");
    press("j");
    press("j");
    press("a");
    assertEqual(calls.pop(), "add questions 2", "Open questions adds a question");
  } finally {
    page.remove();
    STORE.forEach((key) => localStorage.removeItem(key));
  }
});
