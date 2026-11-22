import { HUB_KEYS, hubAction } from "../../static/js/hubs/hub-keys.js";
import { archivedProjectsIn, areaOf, projectsIn } from "../../static/js/hubs/hub-areas.js";
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { HUB_SECTIONS, dayOf, sectionsFor } from "../../static/js/hubs/hub-sections.js";
import { fieldsFor } from "../../static/js/hubs/fields.js";
import { showHubLine } from "../../static/js/hubs/hub-line.js";
import { dueText, isOverdue, statusText } from "../../static/js/hubs/project-facts.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { isHub } from "../../static/js/notes/hub-groups.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
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

test("hub sections: each kind's sections, top to bottom", () => {
  const keys = (kind) => sectionsFor({ kind }).map((each) => each.key).join();
  assertEqual(keys("project"), "questions,tasks,decisions,notes,meetings,people");
  assertEqual(keys("area"), "projects,tasks,questions,decisions,notes,meetings,people");
  assertEqual(keys("resource"), "notes,tasks,questions,decisions,meetings,people,linked");
  assertEqual(keys("meeting"), "tasks,questions,decisions");
  assertEqual(keys("person"), "active,archived,backlinks");
  assertEqual(sectionsFor({ kind: null }).length, 0);
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
  assertEqual(rows[0].detail, dayOf(T));
  assertEqual(section("notes").empty(t.get(7)), "No notes in this resource yet");
  assertEqual(dayOf(""), "");
  assertEqual(dayOf("nonsense"), "");
});

test("hub sections: an area's projects say on hold and overdue, muted when on hold", () => {
  const t = tree();
  const rows = section("projects").rows({ tree: t, today: TODAY }, t.get(1));
  assertEqual(rows.map((r) => `${r.title}${r.muted ? "~" : ""}`).join(), "Acme,Northwind~");
  assertEqual(rows[1].detail, "on hold · overdue since Sun 2026-11-01");
  assertEqual(section("projects").detail(rows), "1 live");
});

test("project facts: status and due texts", () => {
  assertEqual(statusText({ status: "on_hold" }), "on hold");
  assertEqual(statusText({ status: "active" }), "");
  assertEqual(dueText({ due: "2026-12-15" }, TODAY), "due Tue 2026-12-15");
  assertTrue(isOverdue({ due: "2026-11-21" }, TODAY));
  assertTrue(!isOverdue({ due: "2026-11-22" }, TODAY), "due today is not overdue");
  assertEqual(dueText({ due: "" }, TODAY), "");
});

test("hub keys: one table, Tab never bound, modifiers left to the browser", () => {
  const all = HUB_KEYS.flatMap((entry) => entry.keys);
  assertEqual(new Set(all).size, all.length, "no key bound twice");
  assertTrue(!all.includes("Tab"));
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

function withPage(body, { tabActions } = {}) {
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
    onLeave: () => { left += 1; }, ...(tabActions ? { tabActions } : {}) });
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
const active = (section) => {
  const node = section.querySelector("[role=option][aria-selected=true]");
  return node?.querySelector(".hub__title, .hub__label")?.textContent ?? node?.textContent;
};
const rows = (line) => [...line.querySelectorAll(".hub-line__row")].map((row) => row.textContent);

test("hub page: shows only on a hub, a person or a meeting; labels the text box", () => withPage(({ page, line, main, section, hub }) => {
  hub.show({ tree: tree() }, 8);
  assertTrue(section.hidden && line.hidden, "an Inbox note has no sections");
  assertEqual(page.dataset.page, "note");
  assertEqual(main.textContent, "Notes");
  hub.show({ tree: tree() }, 3);
  assertTrue(section.hidden, "a nested note has no sections");
  assertTrue(main.textContent.startsWith("Notes"), "a note in a hub hints at the menu");
  hub.show({ tree: tree(), today: TODAY }, 2);
  assertTrue(!section.hidden && !line.hidden);
  assertEqual(page.dataset.page, "project");
  assertEqual(main.querySelector(".field-label__name").textContent, "Outcome");
  assertEqual(headings(section), "Questions,Tasks,Decisions,Notes,Meetings,People");
  assertEqual(rows(line)[0], "Project▾·Active▾·Set due date·Area: Operations✎·Set time code");
  assertEqual(rows(line)[1], "People:no one yet+ Add person");
  hub.show({ tree: tree() }, 1);
  assertEqual(rows(line)[0], "Area▾·1 live project·1 on hold·0 people·Set time code");
  hub.show({ tree: tree() }, 7);
  assertEqual(rows(line).join("|"), "Resource▾");
  hub.show({ tree: tree(), today: TODAY }, 6);
  assertEqual(rows(line)[0], "Project▾·On hold▾·overdue since Sun 2026-11-01·Area: Operations✎·Set time code");
  assertTrue(line.querySelector(".hub-line__when--late") !== null);
  hub.show({ tree: tree() }, 9);
  assertEqual(rows(line)[0], "Project▾·Active▾·Set due date·no areaSet area·Set time code");
}));

test("hub page: the area on the card opens it", () => withPage(({ line, hub, opened }) => {
  hub.show({ tree: tree() }, 2);
  line.querySelector(".hub-line__link").click();
  assertEqual(opened.join(), "1");
}));

test("hub page: j k g G move over headings and rows, Enter opens, Escape leaves", () => withPage(({ section, hub, opened, left }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  assertEqual(rowTitles(section), "Budget,Kickoff,Minutes");
  assertEqual(active(section), "Questions");
  press("}");
  press("}");
  press("}");
  assertEqual(active(section), "Notes");
  press("j");
  assertEqual(active(section), "Budget");
  press("j");
  press("j");
  press("j");
  assertEqual(active(section), "Meetings", "j goes on to the next heading");
  press("k");
  assertEqual(active(section), "Minutes");
  press("{");
  assertEqual(active(section), "Notes", "{ goes to the section's own heading first");
  press("G");
  assertEqual(active(section), "People");
  press("g");
  assertEqual(active(section), "Questions");
  press("}");
  press("}");
  press("}");
  press("j");
  press("Enter");
  assertEqual(opened.join(), "5");
  press("Escape");
  assertEqual(left(), 1);
}));

test("hub page: Enter or z on a heading folds it; folds are remembered per kind", () => withPage(({ section, hub }) => {
  hub.show({ tree: tree() }, 2);
  hub.focus();
  press("}");
  press("}");
  press("}");
  press("Enter");
  assertEqual(headings(section), "Questions,Tasks,Decisions,Notes+,Meetings,People");
  assertEqual(rowTitles(section), "", "a folded section shows no rows");
  assertEqual(active(section), "Notes", "the heading stays active");
  hub.show({ tree: tree() }, 9);
  assertEqual(headings(section), "Questions,Tasks,Decisions,Notes+,Meetings,People", "another project too");
  hub.focus();
  assertEqual(active(section), "Notes", "the same heading stays active");
  press("z");
  assertEqual(headings(section), "Questions,Tasks,Decisions,Notes,Meetings,People");
  assertEqual(JSON.parse(localStorage.getItem("paradigm.hub.folds"))["project:notes"], false);
}));

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
  press("}");
  press("}");
  press("}");
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
  assertEqual(projectRows[2].detail, `archived ${dayOf(A)}`);
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
  assertEqual(withAdd, "projects,questions,tasks,decisions,notes,meetings,people,active");
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
    press("}");
    press("}");
    press("}");
    press("j");
    press("x");
    assertEqual(calls.length, 2, "a Notes row has no Remove");
    section.querySelector(".hub__section--notes .hub__add").click();
    assertEqual(calls.pop(), "add notes 1");
    section.querySelector("[data-action=remove]").click();
    assertEqual(calls.pop(), "remove projects 2");
  }, { tabActions });
});
