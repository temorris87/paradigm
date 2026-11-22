import { HubPage } from "../../static/js/hubs/hub-page.js";
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { NAV_GROUPS, groupOf, hubsIn, isHub, isPerson, PEOPLE_GROUP } from "../../static/js/notes/hub-groups.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { splitNameRole } from "../../static/js/people/people-commands.js";
import { PAGE_KEYS, pageAction } from "../../static/js/pages/page-keys.js";
import { People, filterOptions, filterPeople, findPerson, hubLinks, peopleOn, rolesText } from "../../static/js/people/people-model.js";
import { peoplePage } from "../../static/js/people/people-page.js";
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
  assertEqual(NAV_GROUPS.map((g) => g.key).join(), "inbox,project,area,resource,people,archive");
  assertEqual(hubsIn(tree, PEOPLE_GROUP).map((n) => n.title).join(), "Bob Smith,Cy Young,Jane Doe", "the archived one is in the Archive");
  assertTrue(PEOPLE_GROUP.foldedByDefault);
});

test("people: findPerson matches the name ignoring case, people only", () => {
  const { tree } = ctx();
  assertEqual(findPerson(tree, "  jane doe ").id, 10);
  assertEqual(findPerson(tree, "Operations"), null);
  assertEqual(findPerson(tree, "Jane"), null);
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
    "E: people go on a hub: open a project, an area or a resource");
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
  assertEqual(row.querySelector(".people__work").textContent, "Northwind · Data engineer");
  assertEqual(row.querySelector(".people__hubs").textContent, "Operations (Sponsor), Rollout (Lead)");
  const hubSelect = section.querySelector("[data-filter=hubId]");
  assertEqual([...hubSelect.options].map((o) => o.textContent).join(), "any,Operations,Pilot,Rollout");
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

test("person page: the card and the Active, Archived and Backlinks sections", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  try {
    const hub = new HubPage({ page, line, section, onOpen: () => {}, onLeave: () => {} });
    hub.show(ctx(), 10);
    assertEqual(line.textContent, "Person·jane@example.com·Northwind·Data engineer✎");
    assertEqual([...section.querySelectorAll(".hub__label")].map((t) => t.textContent).join(), "Active,Archived,Backlinks");
    hub.show(ctx(), 13);
    assertEqual(line.textContent, "Person·Add details");
    hub.show(ctx(), 12);
    assertTrue(line.textContent.startsWith("Archived·Person"), line.textContent);
    hub.show(ctx(), 14);
    assertTrue(section.hidden, "a note under a person has no sections");
  } finally {
    page.remove();
    localStorage.removeItem("paradigm.hub.folds");
  }
});
