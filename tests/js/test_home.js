import { HOME_KEYS, homeAction } from "../../static/js/home/home-keys.js";
import { daysSince, inboxNotes, openQuestions, projectFacts, projectsByArea, todayMeetings } from "../../static/js/home/home-model.js";
import { HomePage } from "../../static/js/home/home-page.js";
import { homeSections } from "../../static/js/home/home-sections.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { NOTE_COMMANDS } from "../../static/js/notes/commands.js";
import { PAGE_VIEWS, PageViews } from "../../static/js/notes/page-views.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { People } from "../../static/js/people/people-model.js";
import { Records } from "../../static/js/records/records-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
// Saturday 21 November 2026.
const TODAY = new Date(2026, 10, 21);
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Rollout", kind: "project", area_id: 1, updated_at: T },
  { id: 3, parent_id: null, title: "Old plan", kind: "project", area_id: 1, archived_at: T, updated_at: T },
  { id: 5, parent_id: null, title: "Billing", kind: "project", area_id: 1, updated_at: T },
  { id: 6, parent_id: null, title: "Solo", kind: "project", updated_at: T },
  { id: 7, parent_id: null, title: "Empty area", kind: "area", updated_at: T },
  { id: 8, parent_id: null, title: "Gone area", kind: "area", archived_at: T, updated_at: T },
  { id: 9, parent_id: null, title: "Orphan", kind: "project", area_id: 8, updated_at: T },
  { id: 4, parent_id: null, title: "Loose", updated_at: "2026-11-01T00:00:00.000Z" },
  { id: 12, parent_id: null, title: "Fresh", updated_at: "2026-11-20T00:00:00.000Z" },
  { id: 13, parent_id: null, title: "Shelved", archived_at: T, updated_at: T },
  { id: 10, parent_id: null, title: "Jane Doe", kind: "person", updated_at: T },
  { id: 20, parent_id: 2, title: "2026-11-21 Standup", kind: "meeting", updated_at: T },
  { id: 21, parent_id: 2, title: "2026-11-21 Review", kind: "meeting", updated_at: T },
  { id: 22, parent_id: 5, title: "2026-11-21 Sync", kind: "meeting", updated_at: T },
  { id: 23, parent_id: 2, title: "2026-11-24 Kickoff", kind: "meeting", updated_at: T },
  { id: 24, parent_id: 3, title: "2026-11-21 Old sync", kind: "meeting", updated_at: T },
  { id: 25, parent_id: 2, title: "2026-11-01 Past", kind: "meeting", updated_at: T },
  { id: 40, parent_id: 2, title: "Which region?", kind: "question", updated_at: T },
  { id: 41, parent_id: 2, title: "Budget?", kind: "question", updated_at: T },
  { id: 42, parent_id: 2, title: "Answered?", kind: "question", updated_at: T },
  { id: 43, parent_id: 3, title: "Archived?", kind: "question", updated_at: T },
];
const MEETINGS = [
  { id: 20, day: "2026-11-21", time: "09:30", attendees: [10] },
  { id: 21, day: "2026-11-21", time: "", attendees: [] },
  { id: 22, day: "2026-11-21", time: "08:00", attendees: [10, 99] },
  { id: 23, day: "2026-11-24", time: "14:00", attendees: [] },
  { id: 24, day: "2026-11-21", time: "07:00", attendees: [] },
  { id: 25, day: "2026-11-01", time: "", attendees: [] },
];
const RECORDS = [
  { id: 40, kind: "question", day: "2026-11-02", answered: "", people: [] },
  { id: 41, kind: "question", day: "2026-11-20", answered: "", people: [], source_id: 20 },
  { id: 42, kind: "question", day: "2026-11-01", answered: "2026-11-05", people: [] },
  { id: 43, kind: "question", day: "2026-10-01", answered: "", people: [] },
];
const ctx = () => ({ tree: new NoteTree(NOTES), people: new People(), meetings: new Meetings(MEETINGS), records: new Records(RECORDS) });
const titles = (entries) => entries.map((e) => e.note.title).join();

test("home: today's meetings by time, untimed last, archived hubs left out", () => {
  const c = ctx();
  assertEqual(titles(todayMeetings(c.tree, c.meetings, TODAY)), "2026-11-21 Sync,2026-11-21 Standup,2026-11-21 Review");
  assertEqual(todayMeetings(c.tree, c.meetings, new Date(2026, 10, 22)).length, 0);
});

test("home: open questions oldest first, answered and archived left out", () => {
  const c = ctx();
  assertEqual(titles(openQuestions(c.tree, c.records)), "Which region?,Budget?");
  assertEqual(daysSince("2026-11-02", TODAY), 19);
  assertEqual(daysSince("2026-11-21", TODAY), 0);
  assertEqual(daysSince("nope", TODAY), null);
});

test("home: live projects by area, no area last; facts", () => {
  const c = ctx();
  const groups = projectsByArea(c.tree);
  assertEqual(groups.map((g) => `${g.area?.title ?? "-"}:${g.projects.map((p) => p.title).join("+")}`).join(" "),
    "Operations:Billing+Rollout -:Orphan+Solo", "empty and archived areas skipped; an archived area's project has none");
  const facts = projectFacts(c.tree, c.meetings, c.records, 2, TODAY);
  assertEqual(facts.openQuestions, 2);
  assertEqual(facts.next.id, 20, "today's earliest counts as next");
  assertEqual(projectFacts(c.tree, c.meetings, c.records, 2, new Date(2026, 10, 22)).next.id, 23);
  assertEqual(projectFacts(c.tree, c.meetings, c.records, 6, TODAY).next, null);
});

test("home: the Inbox, newest change first, archived left out", () => {
  assertEqual(inboxNotes(new NoteTree(NOTES)).map((n) => n.title).join(), "Fresh,Loose");
});

test("home: the section table's headings, details and rows", () => {
  const sections = homeSections(ctx(), TODAY);
  assertEqual(sections.map((s) => `${s.heading} · ${s.detail}`).join("|"), "Today · Sat 2026-11-21|Open questions · 2|Projects · 4|Inbox · 2");
  const cells = (row) => row.cells.map(([, text]) => text).join("|");
  assertEqual(cells(sections[0].rows[0]), "08:00|Sync|Billing · 1 attendee");
  assertEqual(cells(sections[0].rows[2]), "|Review|Rollout · no attendees");
  assertEqual(cells(sections[1].rows[0]), "Which region?|Rollout · asked 2026-11-02 (19 days)");
  assertEqual(cells(sections[1].rows[1]), "Budget?|Rollout · asked 2026-11-20 (1 day) · from Standup");
  const projects = sections[2].rows;
  assertEqual(projects.map(cells).join(";"),
    "Operations;Billing|next Sat 2026-11-21 08:00;Rollout|2 open questions · next Sat 2026-11-21 09:30;No area;Orphan|;Solo|");
  assertTrue(projects[0].group && projects[3].group && projects[3].id === null && projects[1].indent);
  const empty = homeSections({ tree: new NoteTree([]), meetings: new Meetings(), records: new Records() }, TODAY);
  assertEqual(empty.map((s) => `${s.detail}:${s.rows.length}:${s.empty}`).join("|"),
    "Sat 2026-11-21:0:No meetings today|0:0:No open questions|0:0:No active projects|0:0:Inbox is empty");
});

test("home: the key table and :home", () => {
  assertEqual(homeAction({ key: "}" }), "nextSection");
  assertEqual(homeAction({ key: "j", ctrlKey: true }), null);
  assertEqual(homeAction({ key: "Tab" }), null, "Tab is never bound");
  assertTrue(HOME_KEYS.every((row) => row.help));
  assertEqual(PAGE_VIEWS[0].key, "home");
  assertEqual(NOTE_COMMANDS.find((c) => c.name === "home")?.usage, ":home");
});

test("home: the page moves over rows across sections, skips No area, opens and leaves", () => {
  const section = document.createElement("section");
  document.body.append(section);
  try {
    const opened = [];
    let left = 0;
    const page = new HomePage(section, { onOpen: (id) => opened.push(id), onLeave: () => left++, today: () => TODAY });
    page.show(ctx());
    const key = (k) => page.list.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const activeText = () => document.getElementById(page.list.getAttribute("aria-activedescendant")).textContent;
    assertEqual(section.querySelectorAll("[role=option]").length, 3 + 2 + 5 + 2, "No area is not an option");
    assertEqual(activeText(), "08:00SyncBilling · 1 attendee");
    key("}");
    assertEqual(activeText(), "Which region?Rollout · asked 2026-11-02 (19 days)");
    key("j");
    key("{");
    assertEqual(activeText(), "Which region?Rollout · asked 2026-11-02 (19 days)", "{ goes to its own section's start first");
    key("{");
    assertEqual(activeText(), "08:00SyncBilling · 1 attendee");
    key("G");
    assertEqual(activeText(), "Loose");
    key("k");
    key("k");
    key("k");
    assertEqual(activeText(), "Orphan", "j/k skip the No area heading");
    key("Enter");
    assertEqual(opened.join(), "9");
    page.show(ctx());
    assertEqual(activeText(), "Orphan", "a redraw keeps the row");
    key("Escape");
    assertEqual(left, 1);
    section.querySelector(".home__row--group[role=option]").click();
    assertEqual(opened.join(), "9,1", "an area's row opens the area");
    assertEqual(section.querySelector(".home__section--today .home__heading").textContent, "Today · Sat 2026-11-21");
  } finally {
    section.remove();
  }
});

test("home: a page view like the others", () => {
  const main = document.createElement("main");
  const pages = Object.fromEntries(["home", "people"].map((key) => [key, { section: document.createElement("section"), focus() {}, show() {} }]));
  const history = { state: null, pushState() {}, replaceState() {}, back() {} };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=2" });
  assertEqual(views.fromUrl(new URLSearchParams("note=2&home")), "home");
  views.show("home", "replace");
  assertEqual(main.dataset.view, "home");
  assertTrue(!pages.home.section.hidden && pages.people.section.hidden);
});
