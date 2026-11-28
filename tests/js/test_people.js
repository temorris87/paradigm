import { HubPage } from "../../static/js/hubs/hub-page.js";
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { NAV_GROUPS, groupOf, hubsIn, isHub, isPerson, PEOPLE_GROUP } from "../../static/js/notes/hub-groups.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { peopleNamed, splitNameRole } from "../../static/js/people/people-commands.js";
import { PAGE_KEYS, pageAction } from "../../static/js/pages/page-keys.js";
import { People, filterOptions, filterPeople, findPerson, hubLinks, matchPerson, peopleOn, personLabel, rolesText } from "../../static/js/people/people-model.js";
import { peoplePage } from "../../static/js/people/people-page.js";
import { delegateNewDialog, oweNewDialog, taskHubOptions } from "../../static/js/people/topic-commands.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { Records } from "../../static/js/records/records-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Rollout", kind: "project", area_id: 1, updated_at: T },
  { id: 3, parent_id: null, title: "Pilot", kind: "project", area_id: 1, updated_at: T },
  { id: 4, parent_id: null, title: "Old plan", kind: "project", archived_at: T, updated_at: T },
  { id: 5, parent_id: null, title: "Loose", updated_at: T },
  { id: 10, parent_id: null, title: "Jane Doe", kind: "person", updated_at: T },
  { id: 11, parent_id: null, title: "Bob Smith", kind: "person", updated_at: T },
  { id: 12, parent_id: null, title: "Ann Lee", kind: "person", archived_at: T, updated_at: T },
  { id: 13, parent_id: null, title: "Cy Young", kind: "person", updated_at: T },
  { id: 14, parent_id: 10, title: "1:1 notes", updated_at: T },
];
const PEOPLE = [
  { id: 10, org: "Northwind", job: "Data engineer", email: "jane@example.com",
    hubs: [{ hub_id: 1, role: "Sponsor" }, { hub_id: 2, role: "Lead" }, { hub_id: 4, role: "Lead" }] },
  { id: 11, org: "Acme", job: "", email: "", hubs: [{ hub_id: 3, role: "" }, { hub_id: 5, role: "Ghost" }] },
  { id: 12, org: "Acme", job: "", email: "", hubs: [{ hub_id: 2, role: "SME" }] },
  { id: 13, org: "", job: "", email: "", hubs: [] },
];
const ctx = () => ({ tree: new NoteTree(NOTES), people: new People(PEOPLE) });
const tab = (key) => HUB_SECTIONS.find((each) => each.key === key);

test("people: a person is a top-level note in the People group, not a hub", () => {
  const { tree } = ctx();
  assertEqual([10, 14, 1].map((id) => isPerson(tree, id)).join(), "true,false,false");
  assertTrue(!isHub(tree, 10), "a person is not a hub");
  assertEqual(groupOf(tree, 10), PEOPLE_GROUP);
  assertEqual(groupOf(tree, 14), PEOPLE_GROUP, "a note under a person is in People too");
  assertEqual(NAV_GROUPS.map((g) => g.key).join(), "inbox,project,area,resource,people,templates,archive");
  assertEqual(hubsIn(tree, PEOPLE_GROUP).map((n) => n.title).join(), "Bob Smith,Cy Young,Jane Doe", "the archived one is in the Archive");
  assertTrue(PEOPLE_GROUP.foldedByDefault);
});

test("people: findPerson matches the name ignoring case, people only", () => {
  const { tree } = ctx();
  assertEqual(findPerson(tree, "  jane doe ").id, 10);
  assertEqual(findPerson(tree, "Operations"), null);
  assertEqual(findPerson(tree, "Jane"), null);
});

const DANAS = [
  { id: 20, parent_id: null, title: "Dana Northwind", kind: "person", updated_at: T },
  { id: 21, parent_id: null, title: "Dana Okafor", kind: "person", updated_at: T },
  { id: 22, parent_id: null, title: "Dana Archived", kind: "person", archived_at: T, updated_at: T },
  { id: 23, parent_id: null, title: "Dana Trashed", kind: "person", deleted_at: T, updated_at: T },
  { id: 24, parent_id: null, title: "Danube", kind: "project", updated_at: T },
];
const danaTree = (ids) => new NoteTree([...NOTES, ...DANAS.filter((note) => ids.includes(note.id))]);
const meant = (tree, text) => {
  const { person, matches } = matchPerson(tree, text);
  return `${person?.title ?? "-"}|${matches.map((note) => note.title).join(",")}`;
};

test("people: matchPerson takes part of one live person's name", () => {
  const tree = danaTree([20, 22, 23, 24]);
  assertEqual(meant(tree, "Dana"), "Dana Northwind|Dana Northwind");
  assertEqual(meant(tree, "  dan  nor "), "Dana Northwind|Dana Northwind");
  assertEqual(meant(tree, "north"), "Dana Northwind|Dana Northwind");
  assertEqual(meant(tree, "Dana Smith"), "-|", "a name that only partly matches is new");
  assertEqual(meant(tree, "orth"), "-|", "a word must start a word of the name");
  assertEqual(meant(tree, "trashed"), "-|", "trashed people don't count");
  assertEqual(meant(tree, "arch"), "-|", "archived people don't count");
  assertEqual(meant(tree, "dana archived"), "Dana Archived|Dana Archived", "an exact title wins, archived too");
  assertEqual(meant(tree, "danube"), "-|", "people only");
  assertEqual(meant(tree, ""), "-|");
});

test("people: matchPerson with two matches picks no one; an exact title wins", () => {
  const tree = danaTree([20, 21]);
  assertEqual(meant(tree, "dana"), "-|Dana Northwind,Dana Okafor");
  assertEqual(meant(tree, "dana o"), "Dana Okafor|Dana Okafor");
  const exact = new NoteTree([...NOTES, ...DANAS.slice(0, 2), { id: 25, parent_id: null, title: "Dana", kind: "person", updated_at: T }]);
  assertEqual(meant(exact, "DANA"), "Dana|Dana");
});

test("people: personLabel names who it will be, blocks on several", () => {
  const labels = { empty: "Delegate", one: (person) => `Delegate to ${person.title}`, none: "Delegate to a new person" };
  const label = (tree, text) => { const { text: said, blocked } = personLabel(tree, text, labels); return `${said}${blocked ? "!" : ""}`; };
  assertEqual(label(danaTree([20]), " "), "Delegate");
  assertEqual(label(danaTree([20]), "Dana"), "Delegate to Dana Northwind");
  assertEqual(label(danaTree([20, 21]), "Dana"), "2 people match: type more!");
  assertEqual(label(danaTree([20, 21]), "Priya Example"), "Delegate to a new person");
});

test("people: peopleNamed picks the one match, refuses several, makes a new name", async () => {
  const made = [];
  const app = (ids) => ({ tree: danaTree(ids),
    peopleApi: { create: async (name) => { made.push(name); return { note: { id: 99, title: name } }; } } });
  let found = await peopleNamed(app([20]), ["dana nor"], true, "");
  assertEqual(`${found.people[0].id} ${found.made} ${made.length}`, "20 0 0");
  let failure = "";
  try { await peopleNamed(app([20, 21]), ["Dana"], true, ""); } catch (error) { failure = error.message; }
  assertEqual(failure, 'E: 2 people match "Dana": type more');
  assertEqual(made.length, 0, "no duplicate made");
  found = await peopleNamed(app([20]), ["Priya Example"], true, "");
  assertEqual(`${found.people[0].title} ${found.made} ${made.join()}`, "Priya Example 1 Priya Example");
});

test("people: a person's hubs, live ones first; links to non-hubs are skipped", () => {
  const { tree, people } = ctx();
  assertEqual(hubLinks(tree, people, 10).map((l) => `${l.hub.title}:${l.role}${l.archived ? "~" : ""}`).join(),
    "Operations:Sponsor,Rollout:Lead,Old plan:Lead~");
  assertEqual(hubLinks(tree, people, 11).map((l) => l.hub.title).join(), "Pilot", "Loose is in the Inbox, not a hub");
  assertEqual(hubLinks(tree, people, 99).length, 0, "someone the list hasn't caught up with");
});

test("people: an area lists the people on its projects too, once each", () => {
  const { tree, people } = ctx();
  const on = peopleOn(tree, people, tree.get(1));
  assertEqual(on.map((e) => `${e.person.title}${e.archived ? "~" : ""}`).join(), "Bob Smith,Jane Doe,Ann Lee~");
  assertEqual(rolesText(on[1].roles), "Sponsor · Lead on Rollout");
  assertEqual(rolesText(on[0].roles), "on Pilot");
  assertEqual(peopleOn(tree, people, tree.get(2)).map((e) => e.person.title).join(), "Jane Doe,Ann Lee");
});

test("people sections: People on a hub; Active and Archived on a person", () => {
  const c = { ...ctx(), meetings: new Meetings(), records: new Records() };
  const rows = tab("people").rows(c, c.tree.get(2));
  assertEqual(rows.map((r) => `${r.title}|${r.detail}${r.muted ? "~" : ""}`).join(),
    "Jane Doe|Lead · Northwind · Data engineer,Ann Lee|SME · Acme~");
  assertEqual(tab("people").empty({ kind: "resource" }), "No people on this resource yet");
  const live = tab("active").rows(c, c.tree.get(10));
  assertEqual(live.map((r) => `${r.title}|${r.detail}`).join(), "Operations|Area · Sponsor,Rollout|Project · Lead");
  assertEqual(live[0].actions.map((a) => a.key).join(), "role,remove");
  const gone = tab("archived").rows(c, c.tree.get(10));
  assertEqual(gone.map((r) => `${r.title}${r.muted ? "~" : ""}`).join(), "Old plan~");
  assertTrue(tab("archived").folded, "Archived starts folded");
  assertEqual(tab("active").empty(c.tree.get(13)), "Cy Young is on nothing live yet");
});

test("people: filters combine; a hub filter on an area includes its projects", () => {
  const { tree, people } = ctx();
  const names = (filters) => filterPeople(tree, people, filters).map((n) => n.title).join();
  assertEqual(names({}), "Bob Smith,Cy Young,Jane Doe", "archived people are left out");
  assertEqual(names({ hubId: 1 }), "Bob Smith,Jane Doe");
  assertEqual(names({ hubId: 3 }), "Bob Smith");
  assertEqual(names({ role: "Lead" }), "Jane Doe");
  assertEqual(names({ hubId: 3, role: "Lead" }), "", "the role must be on that hub");
  assertEqual(names({ org: "Acme" }), "Bob Smith");
  assertEqual(names({ name: "o" }), "Bob Smith,Cy Young,Jane Doe");
  assertEqual(names({ name: "DOE" }), "Jane Doe");
  assertEqual(names({ role: "Ghost" }), "", "a role on a non-hub doesn't count");
});

test("people: the dropdowns offer what is in use", () => {
  const { tree, people } = ctx();
  const { hubs, roles, orgs } = filterOptions(tree, people);
  assertEqual(hubs.map((h) => h.title).join(), "Operations,Pilot,Rollout", "no archived hubs, no Inbox notes");
  assertEqual(roles.join(), "Lead,SME,Sponsor");
  assertEqual(orgs.join(), "Acme,Northwind");
});

test("people commands: the table and the name, role split", () => {
  const names = NOTE_COMMANDS.map((c) => c.name);
  for (const name of ["people", "newperson", "addperson", "dropperson", "org", "job", "email"]) {
    assertTrue(names.includes(name), name);
  }
  assertEqual(JSON.stringify(splitNameRole(" Jane Doe , Sponsor, Exec ")), '{"name":"Jane Doe","role":"Sponsor, Exec"}');
  assertEqual(JSON.stringify(splitNameRole("Jane Doe")), '{"name":"Jane Doe","role":""}');
});

function fakeApp(currentId, { people = PEOPLE } = {}) {
  const calls = [];
  const app = {
    tree: new NoteTree(NOTES),
    currentId,
    messages: [],
    editor: { showMessage: (text) => app.messages.push(text) },
    say: (text) => app.messages.push(text),
    refreshTree: async () => calls.push("refresh"),
    saveBeforeSwitching: async () => true,
    open: async (id) => calls.push(`open ${id}`),
    peopleApi: {
      create: async (name) => { calls.push(`create ${name}`); return { note: { id: 20, title: name } }; },
      link: async (hub, person, role) => { calls.push(`link ${hub} ${person} ${role}`); return { created: !people.find((p) => p.id === person)?.hubs.some((l) => l.hub_id === hub) }; },
      unlink: async (hub, person) => calls.push(`unlink ${hub} ${person}`),
      update: async (id, field, value) => calls.push(`update ${id} ${field} ${value}`),
    },
  };
  return { app, calls };
}

async function rejects(promise) {
  try {
    await promise;
  } catch (error) {
    return error.message;
  }
  return null;
}

test("people commands: :addperson links, changes a role, and needs ! for someone new", async () => {
  let { app, calls } = fakeApp(3);
  await runNoteCommand(app, { name: "addperson", arg: "jane doe, Sponsor" });
  assertEqual(calls.join(";"), "link 3 10 Sponsor;refresh");
  assertEqual(app.messages.pop(), "Jane Doe is on Pilot as Sponsor");
  await runNoteCommand(app, { name: "addperson", arg: "Jane Doe, Owner" });
  ({ app, calls } = fakeApp(2));
  await runNoteCommand(app, { name: "addperson", arg: "Jane Doe, Owner" });
  assertEqual(app.messages.pop(), "Jane Doe's role on Rollout is now Owner");
  assertEqual(await rejects(runNoteCommand(app, { name: "addperson", arg: "Jim Halpert, Lead" })),
    'E: no person "Jim Halpert" (:addperson! Jim Halpert, Lead makes them)');
  assertEqual(await rejects(runNoteCommand(app, { name: "addperson", arg: "Operations" })), 'E: "Operations" is a note, not a person');
  calls.length = 0;
  await runNoteCommand(app, { name: "addperson", arg: "Jim Halpert, Lead", bang: true });
  assertEqual(calls.join(";"), "create Jim Halpert;link 2 20 Lead;refresh");
  assertEqual(app.messages.pop(), "Jim Halpert is on Rollout as Lead (new in People)");
  ({ app } = fakeApp(5));
  assertEqual(await rejects(runNoteCommand(app, { name: "addperson", arg: "Jane Doe" })),
    "E: people go on a hub: open a project or an area");
});

test("people commands: :dropperson, :newperson, fields only on a person", async () => {
  let { app, calls } = fakeApp(2);
  await runNoteCommand(app, { name: "dropperson", arg: "Jane Doe" });
  assertEqual(calls.join(";"), "unlink 2 10;refresh");
  assertEqual(app.messages.pop(), "Jane Doe is off Rollout");
  assertEqual(await rejects(runNoteCommand(app, { name: "org", arg: "Acme" })),
    "E: this note is not a person (:newperson {name} adds one)");
  ({ app, calls } = fakeApp(10));
  await runNoteCommand(app, { name: "org", arg: " Northwind " });
  await runNoteCommand(app, { name: "email", arg: "" });
  assertEqual(calls.join(";"), "update 10 org Northwind;refresh;update 10 email ;refresh");
  assertEqual(app.messages.join("|"), "Organisation: Northwind|Email cleared");
  calls.length = 0;
  await runNoteCommand(app, { name: "newperson", arg: "Dee Park" });
  assertEqual(calls.join(";"), "create Dee Park;refresh;open 20");
  assertEqual(await rejects(runNoteCommand(app, { name: "newperson", arg: " " })), "E471: Argument required: the person's name");
});

test("page keys: list and search-box scopes; modifiers are the browser's", () => {
  assertEqual(pageAction({ key: "j" }, "list"), "next");
  assertEqual(pageAction({ key: "/" }, "list"), "search");
  assertEqual(pageAction({ key: "Escape" }, "list"), "leave");
  assertEqual(pageAction({ key: "j" }, "search"), null, "j types in the search box");
  assertEqual(pageAction({ key: "Enter" }, "search"), "list");
  assertEqual(pageAction({ key: "j", ctrlKey: true }, "list"), null);
  assertEqual(pageAction({ key: "Tab" }, "list"), null, "Tab moves the focus on");
  assertTrue(PAGE_KEYS.every((row) => row.help), "every row has help text");
});

function withPeoplePage(body) {
  const section = document.createElement("section");
  document.body.append(section);
  const opened = [];
  let left = 0;
  const page = peoplePage(section, { onOpen: (id) => opened.push(id), onLeave: () => { left += 1; } });
  try {
    page.show(ctx());
    // These tests read the whole directory: Everyone (Open items is the default).
    [...section.querySelectorAll(".list-page__pills .chip")].find((pill) => pill.textContent.startsWith("Everyone")).click();
    body({ section, page, opened, left: () => left });
  } finally {
    section.remove();
  }
}

const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const titles = (section) => [...section.querySelectorAll(".people__title")].map((n) => n.textContent).join();

test("people page: lists, filters by the dropdowns and the name box", () => withPeoplePage(({ section }) => {
  assertEqual(titles(section), "Bob Smith,Cy Young,Jane Doe");
  assertEqual(section.querySelector(".list-page__count").textContent, "· 3");
  const row = section.querySelector("[role=option]:last-child");
  assertEqual(row.querySelector(".people__work").textContent, "Data engineer · Northwind");
  assertEqual(row.querySelector(".people__hubs").textContent, "Operations, Rollout");
  const hubSelect = section.querySelector("[data-filter=hubId]");
  assertEqual([...hubSelect.options].map((o) => o.textContent).join(), "Hub: any,Hub: Operations,Hub: Pilot,Hub: Rollout",
    "one line: the label inside the control");
  assertEqual(hubSelect.getAttribute("aria-label"), "Hub");
  assertEqual(section.querySelector("[data-filter=sort]").options[0].textContent, "Sort: most overdue");
  assertEqual(section.querySelector("[data-filter=sort]").closest("label").classList.contains("list-page__label--fit"), true);
  assertEqual(section.querySelectorAll(".list-page__label-text").length, 0,
    "no stacked labels: the bar keeps one line");
  const search = section.querySelector(".list-page__search");
  assertEqual([search.placeholder, search.getAttribute("aria-label")].join(), "Filter by name,Filter by name");
  assertEqual(search.closest("label").querySelector(".key").textContent, "/", "the / cap inside the box");
  hubSelect.value = "1";
  hubSelect.dispatchEvent(new Event("change"));
  assertEqual(titles(section), "Bob Smith,Jane Doe");
  const name = section.querySelector(".list-page__search");
  name.value = "jan";
  name.dispatchEvent(new Event("input"));
  assertEqual(titles(section), "Jane Doe");
  name.value = "zzz";
  name.dispatchEvent(new Event("input"));
  assertEqual(section.querySelector(".list-page__empty").textContent, "No one matches");
}));

test("people page: keys move, open, reach the name box and leave", () => withPeoplePage(({ section, page, opened, left }) => {
  page.focus();
  press("j");
  press("j");
  press("j");
  assertEqual(section.querySelector("[aria-selected=true] .people__title").textContent, "Jane Doe", "j stops at the end");
  press("Enter");
  assertEqual(opened.join(), "10");
  press("/");
  assertEqual(document.activeElement, section.querySelector(".list-page__search"));
  press("Escape");
  assertEqual(document.activeElement, section.querySelector(".list-page__list"), "Escape in the box goes back to the list");
  press("Escape");
  assertEqual(left(), 1);
  section.querySelector("[role=option]").click();
  assertEqual(opened.join(), "10,11");
}));

test("people page: a click on + New person leaves the focus on the list, for the dialog to give back", () => {
  const section = document.createElement("section");
  document.body.append(section);
  let focusedOnAdd = null;
  const page = peoplePage(section, { onOpen: () => {}, onLeave: () => {}, onAdd: () => { focusedOnAdd = document.activeElement; } });
  try {
    page.show(ctx());
    const add = section.querySelector(".list-page__add");
    add.focus();
    add.click();
    assertEqual(focusedOnAdd, section.querySelector(".list-page__list"));
  } finally {
    section.remove();
  }
});

test("people page: a pill click or a dropdown pick with the mouse gives the focus back to the list", () => withPeoplePage(({ section }) => {
  const list = section.querySelector(".list-page__list");
  const pill = section.querySelector(".list-page__pills button:not([aria-pressed=true])");
  pill.focus();
  pill.click();
  assertEqual(document.activeElement, list, "after a pill");
  const sort = section.querySelector("select[data-filter=sort]");
  sort.focus();
  sort.dispatchEvent(new Event("pointerdown"));
  sort.value = sort.options[1].value;
  sort.dispatchEvent(new Event("change"));
  assertEqual(document.activeElement, list, "after a mouse pick");
  sort.focus();
  sort.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  sort.value = sort.options[0].value;
  sort.dispatchEvent(new Event("change"));
  assertEqual(document.activeElement, sort, "a pick with the keys stays, so the arrows step on");
}));

test("person page: the card and the Active, Archived and Backlinks sections", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  try {
    const hub = new HubPage({ page, line, section, onOpen: () => {}, onLeave: () => {} });
    hub.show(ctx(), 10);
    assertEqual(line.textContent, "Person·jane@example.com·Northwind·Data engineer✎", "the note window keeps the card line");
    // Sections with rows (and folded ones) first; the empty ones share the Nothing yet line.
    assertEqual([...section.querySelectorAll(".hub__label, .hub__empty-label")].map((t) => t.textContent).join(), "Active,Archived,They owe me,I owe Jane,To raise next 1:1,Backlinks");
    hub.show(ctx(), 13);
    assertEqual(line.textContent, "Person·Add details");
    hub.show(ctx(), 12);
    assertTrue(line.textContent.startsWith("Archived·Person"), line.textContent);
    hub.show(ctx(), 14);
    assertEqual([...section.querySelectorAll(".hub__label, .hub__empty-label")].map((t) => t.textContent).join(), "Tasks,Files", "a note under a person: its tasks and files");
  } finally {
    page.remove();
    localStorage.removeItem("paradigm.hub.folds");
  }
});

test("people page: Open items by default; the 1:1 counts", async () => {
  const { personCounts } = await import("../../static/js/people/people-page.js");
  const section = document.createElement("section");
  document.body.append(section);
  try {
    const page = peoplePage(section, { onOpen() {}, onLeave() {} });
    page.show(ctx());
    assertEqual([...section.querySelectorAll(".list-page__pills .chip")].map((pill) => pill.textContent).join(), "Something open · 0,Everyone · 3");
    assertEqual(section.querySelectorAll("[role=option]").length, 0, "no one has anything open here");
    const counts = personCounts({ ...ctx(), topics: [{ id: 1, person_id: 10, text: "x", raised_at: "" }] }, 10, new Date(2026, 10, 23));
    assertEqual([counts.waiting, counts.owe, counts.raise].join(), "0,0,1");
  } finally {
    section.remove();
  }
});

// ---- 024: the person page and People as in Figma ------------------------------------------
// Thursday 26 November 2026, 11:00.
const NOW = new Date(2026, 10, 26, 11, 0);
const ADA_NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Rollout", kind: "project", area_id: 1, updated_at: T },
  { id: 10, parent_id: null, title: "Ada Park", kind: "person", updated_at: T },
  { id: 11, parent_id: null, title: "Bob Smith", kind: "person", updated_at: T },
  { id: 12, parent_id: null, title: "Cy Young", kind: "person", updated_at: T },
  { id: 13, parent_id: null, title: "Di Nolan", kind: "person", updated_at: T },
  { id: 30, parent_id: 2, title: "1:1 Ada", kind: "meeting", updated_at: T },
  { id: 31, parent_id: 2, title: "1:1 catch-up", kind: "meeting", updated_at: T },
  { id: 32, parent_id: 2, title: "Team stand-up", kind: "meeting", updated_at: T },
  { id: 33, parent_id: 2, title: "Cancelled sync", kind: "meeting", updated_at: T },
  { id: 34, parent_id: 2, title: "Review", kind: "meeting", updated_at: T },
];
const ADA_MEETINGS = [
  // Ended an hour ago today (a 1:1: she is the only attendee).
  { id: 30, day: "2026-11-26", time: "09:30", end_time: "10:00", attendees: [10] },
  // Next Tuesday, a 1:1 by its title.
  { id: 31, day: "2026-12-01", time: "10:00", end_time: "10:30", attendees: [10, 11] },
  { id: 32, day: "2026-11-27", time: "09:00", end_time: "09:15", attendees: [10, 11, 12] },
  { id: 33, day: "2026-11-26", time: "15:00", attendees: [10, 11], cancelled: true },
  { id: 34, day: "2026-11-03", time: "", attendees: [10, 11] },
];
const ADA_PEOPLE = [
  { id: 10, org: "Northwind", job: "Analyst", email: "ada@example.com", hubs: [{ hub_id: 2, role: "Lead" }] },
  { id: 11, org: "Acme", job: "", email: "", hubs: [{ hub_id: 1, role: "" }] },
  { id: 12, org: "Acme", job: "", email: "", hubs: [] },
  { id: 13, org: "", job: "", email: "", hubs: [] },
];
const adaTask = (id, title, more = {}) => ({ id, note_id: 2, parent_id: null, title, notes: "", due: "", delegate_id: null,
  for_person_id: null, follow_up: "", done: false, done_day: "", position: id, snoozed_until: "", estimate_min: null, ...more });
const ADA_TASKS = [
  adaTask(1, "Send the figures", { delegate_id: 10, follow_up: "2026-11-30" }),
  adaTask(2, "Review her draft", { for_person_id: 10, due: "2026-11-25" }),
  adaTask(3, "Chase Bob", { delegate_id: 11, follow_up: "2026-11-22" }),
  adaTask(4, "Bob's slides", { for_person_id: 11, due: "2026-11-27" }),
];
async function adaCtx(more = {}) {
  const { Tasks } = await import("../../static/js/tasks/tasks-model.js");
  return { tree: new NoteTree(ADA_NOTES), people: new People(ADA_PEOPLE), meetings: new Meetings(ADA_MEETINGS),
    records: new Records(), tasks: new Tasks(ADA_TASKS), sessions: [], topics: [], today: NOW, ...more };
}

test("1:1: still to come is by the clock; Next 1:1, Before that, Last together, this month", async () => {
  const oneOnOne = await import("../../static/js/people/one-on-one.js");
  const { tree, meetings } = await adaCtx();
  assertTrue(!oneOnOne.stillToCome(meetings.get(30), NOW), "ended an hour ago");
  assertTrue(oneOnOne.stillToCome({ day: "2026-11-26", time: "10:30", end_time: "11:30" }, NOW), "still on");
  assertTrue(oneOnOne.stillToCome({ day: "2026-11-26", time: "", end_time: "" }, NOW), "all day today");
  assertTrue(!oneOnOne.stillToCome({ day: "2026-11-26", time: "10:59", end_time: "" }, NOW), "no end: its time");
  assertEqual(oneOnOne.nextOneOnOne(tree, meetings, 10, NOW)?.note.id, 31, "next Tuesday's, not today's that ended");
  assertEqual(oneOnOne.nextTogether(tree, meetings, 10, NOW)?.note.id, 32, "the stand-up comes first");
  assertEqual(oneOnOne.beforeThat(tree, meetings, 10, NOW)?.note.id, 32);
  assertTrue(oneOnOne.isOneOnOne({ note: tree.get(30), meeting: meetings.get(30) }, 10), "the only attendee");
  assertTrue(oneOnOne.isOneOnOne({ note: tree.get(31), meeting: meetings.get(31) }, 11), "1:1 in the title");
  assertTrue(!oneOnOne.isOneOnOne({ note: tree.get(32), meeting: meetings.get(32) }, 10));
  assertEqual(oneOnOne.beforeThat(tree, meetings, 12, NOW), null, "no 1:1, no Before that");
  assertEqual(oneOnOne.lastTogether(tree, meetings, 10, NOW)?.note.id, 30, "the cancelled one never counts");
  assertEqual(oneOnOne.meetingsThisMonth(tree, meetings, 10, NOW), 3, "30, 32 and 34; 33 cancelled; 31 is December");
  assertEqual(oneOnOne.nextTogether(tree, meetings, 10, new Date(2026, 11, 2)), null, "nothing after Tuesday");
  const ended = oneOnOne.endedCount(tree, meetings, NOW);
  assertEqual(ended, 2, "30 and 34 have ended; 33 is cancelled");
  assertEqual(oneOnOne.endedCount(tree, meetings, new Date(2026, 10, 27, 9, 15)), 3, "the stand-up ends at 09:15");
});

test("1:1: due summaries and their chips on People", async () => {
  const { dueSummary, soonDay } = await import("../../static/js/people/one-on-one.js");
  const { owedChips } = await import("../../static/js/people/people-page.js");
  assertEqual(soonDay("2026-11-30", NOW), "Mon");
  assertEqual(soonDay("2026-11-26", NOW), "today");
  assertEqual(soonDay("2026-12-10", NOW), "Thu 10 Dec");
  const late = dueSummary(["2026-11-25", "2026-11-28", ""], NOW);
  assertEqual([late.count, late.late, late.lateDays, late.earliest, late.soon].join(), "3,1,1,2026-11-25,1");
  const text = (chips) => chips.map((c) => `${c.text}/${c.tone}`).join(" ");
  assertEqual(text(owedChips(dueSummary(["2026-11-25"], NOW), "neutral", NOW)), "1 · 1 d late/danger");
  assertEqual(text(owedChips(late, "neutral", NOW)), "3 · 1 d late/danger 1 soon/caution");
  assertEqual(text(owedChips(dueSummary(["2026-11-30"], NOW), "info", NOW)), "1 · Mon/info");
  assertEqual(text(owedChips(dueSummary([""], NOW), "info", NOW)), "1/info");
  assertEqual(owedChips(dueSummary([], NOW), "info", NOW).length, 0);
});

test("people: Sort orders and the footnote's names", async () => {
  const { sortPeople, footnoteText } = await import("../../static/js/people/people-model.js");
  const note = (title) => ({ title });
  const entries = [
    { note: note("Cy"), lateDays: 0, earliest: "2026-11-30", next: "" },
    { note: note("Ann"), lateDays: 0, earliest: "", next: "2026-11-27 09:00" },
    { note: note("Bob"), lateDays: 4, earliest: "2026-11-22", next: "2026-12-01 10:00" },
    { note: note("Abe"), lateDays: 0, earliest: "2026-11-30", next: "" },
  ];
  const names = (sort) => sortPeople(entries, sort).map((e) => e.note.title).join();
  assertEqual(names("overdue"), "Bob,Abe,Cy,Ann", "most days late, then the earliest day, then name");
  assertEqual(names("name"), "Abe,Ann,Bob,Cy");
  assertEqual(names("next"), "Ann,Bob,Abe,Cy", "no meeting last");
  assertEqual(footnoteText({ idle: ["Cy Young"] }), "Showing people with something open, most overdue first. Cy Young has nothing open (o shows everyone)");
  assertEqual(footnoteText({ idle: ["A", "B", "C"] }), "Showing people with something open, most overdue first. A, B and C have nothing open (o shows everyone)");
  assertEqual(footnoteText({ idle: ["A", "B", "C", "D", "E"] }), "Showing people with something open, most overdue first. A, B, C and 2 others have nothing open (o shows everyone)");
  assertEqual(footnoteText({ idle: [] }), "Showing people with something open, most overdue first.");
  assertEqual(footnoteText({ view: "everyone", sort: "name" }), "Showing everyone, by name.");
});

test("people page: Something open, most overdue first; chips; footnote; o, n and the dropdowns", async () => {
  const section = document.createElement("section");
  document.body.append(section);
  let added = 0;
  try {
    const page = peoplePage(section, { onOpen() {}, onLeave() {}, onAdd: () => { added += 1; }, today: () => NOW });
    page.show(await adaCtx());
    const pills = () => [...section.querySelectorAll(".list-page__pills .chip")].map((pill) => `${pill.textContent}:${pill.getAttribute("aria-pressed")}`).join();
    assertEqual(pills(), "Something open · 2:true,Everyone · 4:false");
    assertEqual(titles(section), "Bob Smith,Ada Park", "Bob is 4 d late, Ada 1 d");
    const ada = section.querySelectorAll("[role=option]")[1];
    assertEqual([...ada.querySelectorAll(".people__owed .chip")].map((c) => c.textContent).join(), "1 · Mon");
    assertEqual([...ada.querySelectorAll(".people__owe .chip")].map((c) => c.textContent).join(), "1 · 1 d late");
    assertTrue(ada.querySelector(".people__owe .chip").classList.contains("chip--danger"));
    assertEqual(ada.querySelector(".people__next").textContent, "Fri 27 Nov 09:00Team stand-up", "the next together still to come");
    assertEqual(ada.querySelector(".people__hubs").textContent, "Rollout");
    assertEqual(ada.querySelector(".avatar").textContent, "AP");
    assertEqual(section.querySelector(".list-page__foot").textContent,
      "Showing people with something open, most overdue first. Cy Young and Di Nolan have nothing open (o shows everyone)");
    assertEqual([...section.querySelectorAll(".list-page__head .list-page__cell")].map((c) => c.textContent).join(),
      "Name,They owe me,I owe them,To raise,Next together,On");
    page.focus();
    press("o");
    assertEqual(pills(), "Something open · 2:false,Everyone · 4:true");
    assertEqual(titles(section), "Bob Smith,Ada Park,Cy Young,Di Nolan");
    assertEqual(section.querySelectorAll("[role=option]")[3].querySelector(".people__owed").textContent, "—");
    const sort = section.querySelector("[data-filter=sort]");
    assertEqual([...sort.options].map((o) => o.textContent).join(), "Sort: most overdue,Sort: name,Sort: next together");
    sort.value = "name";
    sort.dispatchEvent(new Event("change"));
    assertEqual(titles(section), "Ada Park,Bob Smith,Cy Young,Di Nolan");
    const hub = section.querySelector("[data-filter=hubId]");
    hub.value = "2";
    hub.dispatchEvent(new Event("change"));
    assertEqual(titles(section), "Ada Park", "only people on Rollout");
    hub.value = "";
    hub.dispatchEvent(new Event("change"));
    const org = section.querySelector("[data-filter=org]");
    org.value = "Acme";
    org.dispatchEvent(new Event("change"));
    assertEqual(titles(section), "Bob Smith,Cy Young");
    page.focus();
    press("n");
    press("a");
    assertEqual(added, 2, "n and a both make a new person");
    press("o");
    assertEqual(titles(section), "Bob Smith", "o back to Something open");
  } finally {
    section.remove();
  }
});

function withPersonPage(body, ctxMore = {}) {
  const page = document.createElement("main");
  page.dataset.role = "main";
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  const calls = [];
  const tabActions = {
    add: (key, owner) => calls.push(`add ${key} ${owner.id}`),
    row: (key, sectionKey, owner, row) => calls.push(`${key} ${sectionKey} ${row.task ?? row.topic ?? row.id}`),
    command: (action, owner) => calls.push(`${action} ${owner.id}`),
  };
  return adaCtx(ctxMore).then((ctx) => {
    try {
      const hub = new HubPage({ page, line, section, onOpen: (id) => calls.push(`open ${id}`), onLeave: () => {}, tabActions,
        renderSnippet: (text) => `<p>${text}</p>`, dashboard: true });
      hub.show(ctx, 10);
      body({ section, hub, calls, ctx, line });
    } finally {
      page.remove();
      localStorage.removeItem("paradigm.hub.folds");
    }
  });
}

const activeText = (section) => section.querySelector("[aria-selected=true]")?.textContent ?? "";

test("person page: the main window draws no card line; its head shows the details", () => withPersonPage(({ line }) => {
  assertTrue(line.hidden, "no Person · email · Org · Role ✎ line under the head");
  assertEqual(line.textContent, "");
}));

test("person page: three cards, then Notes and Together; chips and empty lines", () => withPersonPage(({ section }) => {
  const list = section.querySelector(".hub__list");
  assertTrue(list.classList.contains("hub__list--cards"));
  const lanes = [...list.children].map((lane) => [...lane.querySelectorAll(".hub__label")].map((l) => l.textContent).join("+"));
  assertEqual(lanes.join(" | "), "They owe me+I owe Ada+To raise next 1:1+Notes+Together"
    .replace(/\+(?=I owe|To raise|Notes|Together)/g, " | "));
  const card = (key) => section.querySelector(`.hub__section--${key}`);
  assertEqual([...card("waiting").querySelectorAll(".chip")].map((c) => c.textContent).join(), "Follow up Mon");
  assertEqual(card("waiting").querySelector(".hub__detail").textContent, "Rollout · not placed");
  assertEqual([...card("owe").querySelectorAll(".chip")].map((c) => c.textContent).join(), "Overdue 1 d");
  assertTrue(card("owe").querySelector(".chip").classList.contains("chip--danger"));
  assertEqual(card("owe").querySelector(".hub__detail").textContent, "Rollout · not placed");
  assertEqual(card("raise").querySelector(".hub__empty").textContent, "Nothing to raise. a adds a topic.");
  assertEqual(card("personNotes").querySelector(".hub__empty").textContent, "No notes. Edit ↗ to add some.");
  const together = [...card("together").querySelectorAll(".hub__row")].map((r) => r.textContent);
  assertEqual(together.join(" / "), "RolloutProject · LeadRole…Remove / Last together1:1 Ada · Thu 26 Nov / Meetings this month3 / Backlinks 0 · Archived 0");
  assertEqual([...card("waiting").querySelectorAll("[data-action=add]")].map((b) => b.textContent).join(), "+ Delegate");
  assertEqual([...card("owe").querySelectorAll("[data-action=add]")].map((b) => b.textContent).join(), "+ Task");
  assertEqual([...card("raise").querySelectorAll("[data-action=add]")].map((b) => b.textContent).join(), "+ Topic");
  // a always adds a topic here, so only To raise's button names the key.
  assertEqual([...section.querySelectorAll("button[data-action=add]")].map((b) => b.title).join(),
    "Delegate,Task,Topic (a),Edit ↗,Add to a hub");
}));

test("person page: Tab and Shift+Tab cross the columns; a, r, n, o, Space and d", () => withPersonPage(({ section, hub, calls }) => {
  hub.focus();
  const list = section.querySelector(".hub__list");
  const tab = (shiftKey = false) => {
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
    list.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assertTrue(activeText(section).includes("Send the figures"), `starts on the first task: ${activeText(section)}`);
  assertTrue(tab());
  assertTrue(activeText(section).includes("Review her draft"), "I owe");
  press("Enter");
  press("o");
  assertEqual(calls.splice(0).join("|"), "openTask owe 2|openTask owe 2");
  press(" ");
  press("d");
  assertEqual(calls.splice(0).join("|"), "done owe 2|delegate owe 2");
  assertTrue(tab());
  assertTrue(activeText(section).includes("To raise"), "an empty card: its heading");
  press("a");
  press("n");
  assertEqual(calls.splice(0).join("|"), "addTopic 10|oneOnOne 10");
  assertTrue(tab());
  assertTrue(activeText(section).includes("Notes"));
  assertTrue(tab());
  assertTrue(activeText(section).startsWith("Rollout"), "Together's first row");
  press("r");
  assertEqual(calls.splice(0).join("|"), "role active 2", "r on a hub row: its Role…");
  assertTrue(!tab(), "past the last column, Tab leaves");
  assertTrue(tab(true));
  assertTrue(activeText(section).includes("Notes"), "Shift+Tab goes back");
}));

test("person page: r marks a topic raised; Backlinks · Archived unfolds both lists", () => withPersonPage(({ section, hub, calls }) => {
  hub.focus();
  const list = section.querySelector(".hub__list");
  list.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  list.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  assertTrue(activeText(section).startsWith("○Bring the plan"), activeText(section));
  // Each button names the key the hint bar gives it on this page.
  assertEqual([...section.querySelectorAll(".hub__section--raise .hub__row-action")].map((b) => b.title).join(),
    "Raised (r),Remove (x)");
  press("r");
  assertEqual(calls.splice(0).join("|"), "done raise 7");
  assertTrue(!section.querySelector(".hub__section--togetherBacklinks"), "folded until asked");
  [...section.querySelectorAll(".hub__row")].find((row) => row.textContent.startsWith("Backlinks")).click();
  assertTrue(section.querySelector(".hub__section--togetherBacklinks"), "Backlinks shown");
  assertTrue(section.querySelector(".hub__section--togetherArchived"), "Archived shown");
  assertTrue(activeText(section).startsWith("Backlinks"), "the cursor stays on the line");
  press("Enter");
  assertTrue(!section.querySelector(".hub__section--togetherBacklinks"), "Enter folds them again");
}, { topics: [{ id: 7, person_id: 10, text: "Bring the plan", source_note_id: null, raised_at: "" }], body: { id: 10, text: "Likes **short** updates" } }));

// Drawn with the real stylesheets in a shadow root (their rules never touch the test page), in a
// box as wide as one card at a 1400 px window.
const CARD_SHEETS = ["tokens.css", "themes/nord-light.css", "base.css", "hub.css", "dash-head.css", "person-cards.css", "chip.css"]
  .map((name) => `../../static/css/${name}`);

test("person page: a To raise row wraps its topic and shows its source in full, selected or not", async () => {
  const host = document.createElement("div");
  host.style.setProperty("width", "330px");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const loads = CARD_SHEETS.map((path) => new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL(path, import.meta.url).href });
    link.addEventListener("load", resolve);
    link.addEventListener("error", () => reject(new Error(`could not load ${path}`)));
    shadow.append(link);
  }));
  const page = document.createElement("main");
  page.dataset.role = "main";
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  shadow.append(page);
  try {
    await Promise.all(loads);
    const topic = "Career goals for next year and the promotion case we talked about in October";
    const ctx = await adaCtx({ topics: [{ id: 7, person_id: 10, text: topic, source_note_id: 30, raised_at: "" }] });
    new HubPage({ page, line, section, onOpen: () => {}, onLeave: () => {}, tabActions: {},
      renderSnippet: (text) => `<p>${text}</p>`, dashboard: true }).show(ctx, 10);
    const row = section.querySelector(".hub__section--raise .hub__row");
    const title = row.querySelector(".hub__title");
    const detail = row.querySelector(".hub__detail");
    // A long meeting name: the source wraps too, never cut.
    detail.textContent = "from Quarterly planning with the Northwind account team and finance";
    const whole = (node) => node.scrollWidth <= node.clientWidth + 1 && node.getBoundingClientRect().width > 60;
    for (const selected of ["false", "true"]) {
      row.setAttribute("aria-selected", selected);
      assertEqual(title.textContent, topic);
      assertTrue(whole(title), `the topic is not cut (selected ${selected})`);
      assertTrue(title.getBoundingClientRect().height > 2 * parseFloat(getComputedStyle(title).fontSize),
        `the topic wraps to a second line (selected ${selected})`);
      assertTrue(whole(detail), `the source is shown in full (selected ${selected}): ${detail.getBoundingClientRect().width}px`);
      assertTrue(detail.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 1, "the source is under the topic");
    }
  } finally {
    host.remove();
  }
});

test("person page: They owe me rows name the hub and where the task is placed", () => withPersonPage(({ section }) => {
  const detail = section.querySelector(".hub__section--waiting .hub__detail").textContent;
  assertTrue(detail.startsWith("Rollout · 45 min placed "), detail);
}, { sessions: [{ id: 1, task_id: 1, day: "2026-11-30", start: "09:00", end: "09:45" }] }));

test("person page: the Notes card renders the text; Enter edits it", () => withPersonPage(({ section, hub, calls }) => {
  const notes = section.querySelector(".hub__section--personNotes");
  assertEqual(notes.querySelector(".hub__doc").innerHTML, "<p>Likes updates</p>");
  notes.querySelector(".hub__row").click();
  assertEqual(calls.splice(0).join("|"), "add personNotes 10");
}, { body: { id: 10, text: "Likes updates" } }));

test("person head: NEXT 1:1 still to come, Before that, None planned", async () => {
  const { DashHead } = await import("../../static/js/hubs/dash-head.js");
  const root = document.createElement("header");
  const head = new DashHead(root, { onLog() {}, onDigest() {}, onEdit() {}, onOneOnOne() {} });
  const ctx = await adaCtx();
  head.show(ctx, ctx.tree.get(10), "");
  assertEqual(root.querySelector(".avatar").textContent, "AP");
  assertEqual(root.querySelector(".dash-head__meta").textContent, "Analyst · Northwindada@example.com");
  assertEqual(root.querySelector(".dash-head__email").getAttribute("href"), "mailto:ada@example.com");
  assertEqual(root.querySelector(".dash-head__next-when").textContent, "Tue 1 Dec · 10:00–10:30");
  assertEqual(root.querySelector(".dash-head__before").textContent, "Before that: Team stand-up, tomorrow 09:00");
  head.show({ ...ctx, today: new Date(2026, 10, 25, 8, 0) }, ctx.tree.get(10), "");
  assertEqual(root.querySelector(".dash-head__next-when").textContent, "Thu 26 Nov · 09:30–10:00", "the day before: Thursday's");
  assertEqual(root.querySelector(".dash-head__before"), null, "nothing comes before it");
  head.show({ ...ctx, today: new Date(2026, 11, 2) }, ctx.tree.get(10), "");
  assertEqual(root.querySelector(".dash-head__next-when").textContent, "None planned");
  assertEqual(root.querySelector(".dash-head__button--primary").textContent, "Start 1:1 notes");
});

test("person page: + Delegate and + Task offer the live hubs, the person's own first", () => {
  const { tree, people } = ctx();
  const jane = taskHubOptions(tree, people, tree.get(10)).map(([id]) => id);
  assertEqual(jane.slice(0, 2).sort().join(), "1,2", "Operations and Rollout, the hubs Jane is on, come first");
  assertEqual(jane.slice(2).join(), "3", "then Pilot; never the archived hub, the Inbox note or a person");
  assertEqual(taskHubOptions(tree, people, tree.get(13)).map(([id]) => id).sort().join(), "1,2,3", "Cy is on no hub: all of them");
});

test("person page: + Delegate and + Task put the new task on the chosen hub, never on the person", async () => {
  const { tree, people } = ctx();
  const calls = [];
  const app = {
    tree, people,
    tasksApi: {
      create: async (noteId, title, options) => { calls.push(["create", noteId, title, options?.due ?? ""]); return { id: 99, title }; },
      delegate: async (id, personId, follow) => { calls.push(["delegate", id, personId, follow]); },
      setFor: async (id, personId) => { calls.push(["for", id, personId]); },
    },
    changes: { send: () => {} },
    refreshTree: async () => {},
    say: () => {},
    focusNote: () => {},
  };
  for (const open of [delegateNewDialog, oweNewDialog]) {
    const shut = open(app, tree.get(10));
    await Promise.resolve();
    const dialog = document.querySelector("dialog.dialog");
    dialog.querySelector("input").value = "Check Northwind invoice";
    const select = dialog.querySelector("select");
    select.value = "3";
    dialog.querySelector("form").requestSubmit();
    await shut;
  }
  assertEqual(JSON.stringify(calls), JSON.stringify([
    ["create", 3, "Check Northwind invoice", ""], ["delegate", 99, 10, ""],
    ["create", 3, "Check Northwind invoice", ""], ["for", 99, 10],
  ]));
});
