import { HubPage } from "../../static/js/hubs/hub-page.js";
import { HUB_TABS, tabsFor } from "../../static/js/hubs/hub-tabs.js";
import { PERIODS, localDay, parseDay, parseTime, periodRange, whenText } from "../../static/js/meetings/meeting-days.js";
import { splitNames, splitWhen } from "../../static/js/meetings/meetings-commands.js";
import { Meetings, allMeetings, attendeesOf, filterMeetings, meetingFilterHubs, meetingsOn, meetingsWith, shortTitle } from "../../static/js/meetings/meetings-model.js";
import { meetingsPage } from "../../static/js/meetings/meetings-page.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { hubOf, isHub, isMeeting } from "../../static/js/notes/hub-groups.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { People } from "../../static/js/people/people-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
// Saturday 21 November 2026.
const TODAY = new Date(2026, 10, 21);
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Rollout", kind: "project", area_id: 1, updated_at: T },
  { id: 3, parent_id: null, title: "Old plan", kind: "project", archived_at: T, updated_at: T },
  { id: 4, parent_id: null, title: "Loose", updated_at: T },
  { id: 10, parent_id: null, title: "Jane Doe", kind: "person", updated_at: T },
  { id: 11, parent_id: null, title: "Bob Lee", kind: "person", updated_at: T },
  { id: 20, parent_id: 2, title: "2026-11-24 Kickoff", kind: "meeting", updated_at: T },
  { id: 21, parent_id: 2, title: "2026-11-17 Planning", kind: "meeting", updated_at: T },
  { id: 22, parent_id: 1, title: "2026-11-21 Review", kind: "meeting", updated_at: T },
  { id: 23, parent_id: 3, title: "2025-06-01 Old sync", kind: "meeting", updated_at: T },
  { id: 24, parent_id: 20, title: "Actions", updated_at: T },
  { id: 25, parent_id: 2, title: "Plan", updated_at: T },
];
const MEETINGS = [
  { id: 20, day: "2026-11-24", time: "14:00", attendees: [10, 11] },
  { id: 21, day: "2026-11-17", time: "", attendees: [10] },
  { id: 22, day: "2026-11-21", time: "09:30", attendees: [] },
  { id: 23, day: "2025-06-01", time: "", attendees: [10, 99] },
];
const PEOPLE = [{ id: 10, org: "Northwind", job: "Data engineer", email: "", hubs: [] }];
const ctx = () => ({ tree: new NoteTree(NOTES), people: new People(PEOPLE), meetings: new Meetings(MEETINGS) });
const tab = (key) => HUB_TABS.find((each) => each.key === key);
const titles = (entries) => entries.map((e) => e.note.title).join();

test("meeting days: local days, words, times and the weekday", () => {
  assertEqual(localDay(TODAY), "2026-11-21");
  assertEqual(parseDay("tomorrow", TODAY), "2026-11-22");
  assertEqual(parseDay("Yesterday", TODAY), "2026-11-20");
  assertEqual(parseDay("2026-12-31", TODAY), "2026-12-31");
  assertEqual(parseDay("Kickoff", TODAY), null);
  let error = "";
  try { parseDay("2026-02-30", TODAY); } catch (e) { error = e.message; }
  assertEqual(error, 'E: "2026-02-30" is not a date like 2026-11-24');
  assertEqual(parseTime("9:30"), "09:30");
  assertEqual(parseTime("Kickoff"), null);
  assertEqual(whenText({ day: "2026-11-24", time: "14:00" }), "Tue 2026-11-24 14:00");
  assertEqual(whenText({ day: "2026-11-21", time: "" }), "Sat 2026-11-21");
});

test("meeting days: periods start weeks on Monday", () => {
  const range = (key) => JSON.stringify(periodRange(key, TODAY));
  assertEqual(range("thisWeek"), '{"from":"2026-11-16","to":"2026-11-22"}');
  assertEqual(range("lastWeek"), '{"from":"2026-11-09","to":"2026-11-15"}');
  assertEqual(range("thisMonth"), '{"from":"2026-11-01","to":"2026-11-30"}');
  assertEqual(range("lastMonth"), '{"from":"2026-10-01","to":"2026-10-31"}');
  assertEqual(range("upcoming"), '{"from":"2026-11-21","to":null}');
  assertEqual(JSON.stringify(periodRange("lastMonth", new Date(2026, 0, 15))), '{"from":"2025-12-01","to":"2025-12-31"}');
  assertEqual(periodRange("", TODAY), null);
  assertEqual(PERIODS.length, 7);
});

test("meetings: a meeting is a note in a hub, never a hub itself", () => {
  const { tree } = ctx();
  assertTrue(isMeeting(tree, 20) && !isHub(tree, 20));
  assertEqual(hubOf(tree, 24).title, "Rollout");
  assertEqual(hubOf(tree, 4), null, "an Inbox note is in no hub");
});

test("meetings: newest first; an area includes its projects'; archived last", () => {
  const { tree, meetings } = ctx();
  assertEqual(titles(allMeetings(tree, meetings)), "2026-11-24 Kickoff,2026-11-21 Review,2026-11-17 Planning,2025-06-01 Old sync");
  assertEqual(titles(meetingsOn(tree, meetings, tree.get(1))), "2026-11-24 Kickoff,2026-11-21 Review,2026-11-17 Planning");
  assertEqual(titles(meetingsOn(tree, meetings, tree.get(2))), "2026-11-24 Kickoff,2026-11-17 Planning");
  assertEqual(titles(meetingsWith(tree, meetings, 10)), "2026-11-24 Kickoff,2026-11-17 Planning,2025-06-01 Old sync");
  assertEqual(attendeesOf(tree, meetings, 23).map((p) => p.title).join(), "Jane Doe", "someone trashed is left out");
  assertEqual(attendeesOf(tree, meetings, 20).map((p) => p.title).join(), "Bob Lee,Jane Doe");
});

test("meetings: a short title drops only the meeting's own leading date", () => {
  assertEqual(shortTitle({ title: "2026-11-24 Kickoff" }, { day: "2026-11-24" }), "Kickoff");
  assertEqual(shortTitle({ title: "2026-11-24 Kickoff" }, { day: "2026-11-25" }), "2026-11-24 Kickoff");
  assertEqual(shortTitle({ title: "Kickoff" }, { day: "" }), "Kickoff");
});

test("meetings: the page's filters combine", () => {
  const { tree, meetings } = ctx();
  const list = (filters) => titles(filterMeetings(tree, meetings, filters, TODAY));
  assertEqual(list({}), "2026-11-24 Kickoff,2026-11-21 Review,2026-11-17 Planning", "archived hubs left out");
  assertEqual(list({ hubId: 2 }), "2026-11-24 Kickoff,2026-11-17 Planning");
  assertEqual(list({ period: "upcoming" }), "2026-11-24 Kickoff,2026-11-21 Review");
  assertEqual(list({ period: "thisWeek" }), "2026-11-21 Review,2026-11-17 Planning");
  assertEqual(list({ period: "today" }), "2026-11-21 Review");
  assertEqual(list({ hubId: 1, title: "KICK" }), "2026-11-24 Kickoff");
  assertEqual(meetingFilterHubs(tree, meetings).map((h) => h.title).join(), "Operations,Rollout");
});

test("meeting tabs: Meetings on hubs and people, Attendees and Notes on a meeting", () => {
  const c = ctx();
  assertEqual(tabsFor(c.tree.get(2)).map((t) => t.key).join(), "notes,people,meetings");
  assertEqual(tabsFor(c.tree.get(20)).map((t) => t.key).join(), "attendees,notes");
  assertEqual(tabsFor(c.tree.get(10)).map((t) => t.key).join(), "notes,hubs,meetings");
  const rows = (key, id) => tab(key).rows(c, c.tree.get(id)).map((r) => `${r.title}|${r.detail}${r.muted ? "~" : ""}`).join(",");
  assertEqual(rows("meetings", 1), "Kickoff|Tue 2026-11-24 14:00 · on Rollout · 2 attendees,"
    + "Review|Sat 2026-11-21 09:30 · no attendees,Planning|Tue 2026-11-17 · on Rollout · 1 attendee");
  assertEqual(rows("meetings", 10), "Kickoff|Tue 2026-11-24 14:00 · Rollout · 2 attendees,"
    + "Planning|Tue 2026-11-17 · Rollout · 1 attendee,Old sync|Sun 2025-06-01 · Old plan · 1 attendee · archived~");
  assertEqual(rows("attendees", 20), "Bob Lee|,Jane Doe|Northwind · Data engineer");
  assertEqual(tab("notes").rows(c, c.tree.get(2)).map((r) => r.title).join(), "Plan", "meetings have their own tab");
  assertEqual(tab("notes").rows(c, c.tree.get(20)).map((r) => r.title).join(), "Actions");
  assertEqual(tab("meetings").empty({ kind: "resource" }), "No meetings in this resource yet (:meeting [{date}] [{time}] {title})");
});

test("meeting page: the meeting line and its tabs", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  const opened = [];
  try {
    const hub = new HubPage({ page, line, section, onOpen: (id) => opened.push(id), onLeave: () => {} });
    hub.show(ctx(), 20);
    assertEqual(line.textContent, "Meeting·Tue 2026-11-24 14:00·in Rollout·2 attendees");
    line.querySelector("button").click();
    assertEqual(opened.join(), "2");
    assertEqual([...section.querySelectorAll("[role=tab]")].map((t) => t.textContent).join(), "Attendees,Notes");
    hub.show(ctx(), 24);
    assertTrue(section.hidden, "a note under a meeting has no panel");
  } finally {
    page.remove();
    ["paradigm.hub.size", "paradigm.hub.tabs"].forEach((key) => localStorage.removeItem(key));
  }
});

test("meetings page: lists and filters by period", () => {
  const section = document.createElement("section");
  document.body.append(section);
  try {
    const page = meetingsPage(section, { onOpen: () => {}, onLeave: () => {}, today: () => TODAY });
    page.show(ctx());
    const shown = () => [...section.querySelectorAll(".meetings__title")].map((n) => n.textContent).join();
    assertEqual(shown(), "Kickoff,Review,Planning");
    const first = section.querySelector("[role=option]");
    assertEqual([...first.children].map((n) => n.textContent).join("|"), "Tue 2026-11-24 14:00|Kickoff|Rollout|Bob Lee, Jane Doe");
    const period = section.querySelector("[data-filter=period]");
    assertEqual(period.options[0].textContent, "any time");
    period.value = "lastWeek";
    period.dispatchEvent(new Event("change"));
    assertEqual(section.querySelector(".list-page__empty").textContent, "No meetings match (:meeting {title} on a hub makes one)");
  } finally {
    section.remove();
  }
});

test("meeting commands: splitting the date, time and names", () => {
  assertEqual(JSON.stringify(splitWhen("tomorrow 9:30 Weekly sync", TODAY)), '{"day":"2026-11-22","time":"09:30","rest":"Weekly sync"}');
  assertEqual(JSON.stringify(splitWhen("Weekly sync", TODAY)), '{"day":null,"time":null,"rest":"Weekly sync"}');
  assertEqual(JSON.stringify(splitWhen("14:00 Retro", TODAY)), '{"day":null,"time":"14:00","rest":"Retro"}');
  assertEqual(splitNames(" Jane Doe, Bob Lee ,, ").join("|"), "Jane Doe|Bob Lee");
  const names = NOTE_COMMANDS.map((c) => c.name);
  for (const name of ["meeting", "meetings", "date", "attendee", "dropattendee"]) assertTrue(names.includes(name), name);
});

function fakeApp(currentId) {
  const calls = [];
  const app = {
    tree: new NoteTree(NOTES),
    meetings: new Meetings(MEETINGS),
    currentId,
    today: () => TODAY,
    messages: [],
    editor: { showMessage: (text) => app.messages.push(text) },
    session: { updateMeta: (note) => calls.push(`meta ${note.title}`) },
    refreshTree: async () => calls.push("refresh"),
    saveBeforeSwitching: async () => true,
    open: async (id) => calls.push(`open ${id}`),
    peopleApi: { create: async (name) => { calls.push(`person ${name}`); return { note: { id: 30, title: name } }; } },
    meetingsApi: {
      create: async (hub, name, day, time) => { calls.push(`create ${hub} ${name} ${day} ${time}`); return { note: { id: 40, title: `${day} ${name}` } }; },
      update: async (id, day, time) => { calls.push(`update ${id} ${day} ${time}`); return { note: { id, title: `${day} Kickoff` }, meeting: { day, time } }; },
      attend: async (id, ids) => { calls.push(`attend ${id} ${ids}`); return { added: ids.filter((each) => !MEETINGS.find((m) => m.id === id).attendees.includes(each)) }; },
      unattend: async (id, person) => calls.push(`unattend ${id} ${person}`),
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

test("meeting commands: :meeting goes in the open note's hub", async () => {
  let { app, calls } = fakeApp(25);
  await runNoteCommand(app, { name: "meeting", arg: "Weekly sync" });
  assertEqual(calls.join(";"), "create 2 Weekly sync 2026-11-21 ;refresh;open 40");
  assertEqual(app.messages.pop(), '"2026-11-21 Weekly sync" made in Rollout (:attendee {name}, {name}... adds people)');
  calls.length = 0;
  await runNoteCommand(app, { name: "meeting", arg: "2026-11-24 14:00 Kickoff two" });
  assertEqual(calls[0], "create 2 Kickoff two 2026-11-24 14:00");
  assertEqual(await rejects(runNoteCommand(app, { name: "meeting", arg: "tomorrow" })), "E471: Argument required: :meeting [{date}] [{time}] {title}");
  ({ app } = fakeApp(4));
  assertEqual(await rejects(runNoteCommand(app, { name: "meeting", arg: "X" })),
    "E: meetings go in a hub: open a project, an area or a resource (or a note in one)");
  ({ app } = fakeApp(10));
  assertTrue((await rejects(runNoteCommand(app, { name: "meeting", arg: "X" }))).startsWith("E: meetings go in a hub"), "not on a person");
});

test("meeting commands: :date, :attendee and :dropattendee on a meeting", async () => {
  let { app, calls } = fakeApp(20);
  await runNoteCommand(app, { name: "date", arg: "tomorrow 9:00" });
  assertEqual(calls.join(";"), "update 20 2026-11-22 09:00;meta 2026-11-22 Kickoff;refresh");
  assertEqual(app.messages.pop(), '"2026-11-22 Kickoff" is on Sun 2026-11-22 09:00');
  assertEqual(await rejects(runNoteCommand(app, { name: "date", arg: "soon" })), "E471: Argument required: :date {date} [{time}], like :date 2026-11-24 14:00");
  assertEqual(await rejects(runNoteCommand(app, { name: "date", arg: "today noon" })), 'E: "noon" is not a time like 14:30');
  calls.length = 0;
  ({ app, calls } = fakeApp(21));
  await runNoteCommand(app, { name: "attendee", arg: "jane doe, Bob Lee" });
  assertEqual(calls.join(";"), "attend 21 10,11;refresh");
  assertEqual(app.messages.pop(), "Bob Lee attending 2026-11-17 Planning");
  assertEqual(await rejects(runNoteCommand(app, { name: "attendee", arg: "Bob Lee, Dee Park" })),
    'E: no person "Dee Park" (:attendee! Bob Lee, Dee Park adds them to People)');
  assertEqual(await rejects(runNoteCommand(app, { name: "attendee", arg: "Operations" })), 'E: "Operations" is a note, not a person');
  calls.length = 0;
  await runNoteCommand(app, { name: "attendee", arg: "Dee Park", bang: true });
  assertEqual(calls.join(";"), "person Dee Park;attend 21 30;refresh");
  assertEqual(app.messages.pop(), "Dee Park attending 2026-11-17 Planning (1 new in People)");
  calls.length = 0;
  await runNoteCommand(app, { name: "dropattendee", arg: "jane doe" });
  assertEqual(calls.join(";"), "unattend 21 10;refresh");
  ({ app } = fakeApp(2));
  assertEqual(await rejects(runNoteCommand(app, { name: "attendee", arg: "Jane Doe" })),
    "E: this note is not a meeting (:meeting {title} on a hub makes one)");
  ({ app } = fakeApp(20));
  assertEqual(await rejects(runNoteCommand(app, { name: "addperson", arg: "Jane Doe" })),
    "E: on a meeting, :attendee {name} says who attended");
});

test("page views: one step from the note, also when switching pages", () => {
  const main = document.createElement("main");
  const states = [];
  const history = {
    state: null,
    pushState(state, _, url) { this.state = state; states.push(`push ${url}`); },
    replaceState(state, _, url) { this.state = state; states.push(`replace ${url}`); },
    back() { states.push("back"); },
  };
  const fakePage = () => ({ section: document.createElement("section"), focus() {}, show() {} });
  const pages = { people: fakePage(), meetings: fakePage() };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=2" });
  assertEqual(views.fromUrl(new URLSearchParams("note=2&meetings")), "meetings");
  views.show("people", "push");
  views.show("meetings", "push");
  assertEqual(states.join(";"), "push /?note=2&people;replace /?note=2&meetings");
  assertEqual(main.dataset.view, "meetings");
  assertTrue(pages.people.section.hidden && !pages.meetings.section.hidden);
  assertTrue(views.leave(), "went Back");
  assertEqual(states.pop(), "back");
  history.state = null;
  assertEqual(views.leave(), false, "loaded with the flag: a new step to the note");
  assertEqual(states.pop(), "push /?note=2");
  assertEqual(views.shown, null);
  assertEqual(main.dataset.view, undefined);
});
