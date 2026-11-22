import { HubPage } from "../../static/js/hubs/hub-page.js";
import { HUB_TABS, tabsFor } from "../../static/js/hubs/hub-tabs.js";
import { Meetings } from "../../static/js/meetings/meetings-model.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { inRecordBelow, isDecisionOrQuestion, isHub, meetingOf } from "../../static/js/notes/hub-groups.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { People } from "../../static/js/people/people-model.js";
import { splitDay } from "../../static/js/records/records-commands.js";
import { Records, isOpen, peopleOf, recordsOn } from "../../static/js/records/records-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const TODAY = new Date(2026, 10, 21);
const NOTES = [
  { id: 1, parent_id: null, title: "Operations", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Rollout", kind: "project", area_id: 1, updated_at: T },
  { id: 3, parent_id: null, title: "Old plan", kind: "project", area_id: 1, archived_at: T, updated_at: T },
  { id: 4, parent_id: null, title: "Loose", updated_at: T },
  { id: 10, parent_id: null, title: "Jane Doe", kind: "person", updated_at: T },
  { id: 11, parent_id: null, title: "Bob Lee", kind: "person", updated_at: T },
  { id: 20, parent_id: 2, title: "2026-11-24 Kickoff", kind: "meeting", updated_at: T },
  { id: 25, parent_id: 2, title: "Plan", updated_at: T },
  { id: 30, parent_id: 2, title: "Use Postgres", kind: "decision", updated_at: T },
  { id: 31, parent_id: 20, title: "Ship in March", kind: "decision", updated_at: T },
  { id: 32, parent_id: 1, title: "One budget", kind: "decision", updated_at: T },
  { id: 33, parent_id: 3, title: "Old call", kind: "decision", updated_at: T },
  { id: 40, parent_id: 2, title: "Who owns the feed?", kind: "question", updated_at: T },
  { id: 41, parent_id: 2, title: "Which region?", kind: "question", updated_at: T },
  { id: 42, parent_id: 20, title: "Budget?", kind: "question", updated_at: T },
  { id: 43, parent_id: 2, title: "Hosting?", kind: "question", updated_at: T },
  { id: 44, parent_id: 30, title: "Why", updated_at: T },
];
const RECORDS = [
  { id: 30, kind: "decision", day: "2026-11-20", people: [10, 11, 99] },
  { id: 31, kind: "decision", day: "2026-11-24", people: [] },
  { id: 32, kind: "decision", day: "2026-11-18", people: [10] },
  { id: 33, kind: "decision", day: "2025-01-01", people: [10] },
  { id: 40, kind: "question", day: "2026-11-19", answered: "", people: [10] },
  { id: 41, kind: "question", day: "2026-11-10", answered: "", people: [] },
  { id: 42, kind: "question", day: "2026-11-24", answered: "2026-11-25", people: [] },
  { id: 43, kind: "question", day: "2026-11-01", answered: "2026-11-02", people: [] },
];
const MEETINGS = [{ id: 20, day: "2026-11-24", time: "14:00", attendees: [] }];
const ctx = () => ({ tree: new NoteTree(NOTES), people: new People(), meetings: new Meetings(MEETINGS), records: new Records(RECORDS) });
const tab = (key) => HUB_TABS.find((each) => each.key === key);
const titles = (entries) => entries.map((e) => e.note.title).join();

test("records: kinds, meetings above, notes tabs leave them out", () => {
  const tree = new NoteTree(NOTES);
  assertTrue(isDecisionOrQuestion(tree, 30) && isDecisionOrQuestion(tree, 40) && !isDecisionOrQuestion(tree, 20));
  assertTrue(!isHub(tree, 30));
  assertEqual(meetingOf(tree, 31)?.id, 20);
  assertEqual(meetingOf(tree, 30), null);
  assertEqual(meetingOf(tree, 20), null, "a meeting is not from itself");
  assertTrue(inRecordBelow(tree, 44, 2) && !inRecordBelow(tree, 25, 2));
  assertEqual(tab("notes").rows(ctx(), tree.get(2)).map((r) => r.title).join(), "Plan");
  assertEqual(tab("notes").rows(ctx(), tree.get(30)).map((r) => r.title).join(), "Why");
  assertEqual(tabsFor(tree.get(30)).length, 0, "a decision has no panel");
  assertTrue(isOpen({ answered: "" }) && !isOpen({ answered: "2026-11-25" }));
});

test("records: decisions newest first; a hub's, an area's, a meeting's, a person's", () => {
  const c = ctx();
  assertEqual(titles(recordsOn(c.tree, c.records, c.tree.get(2), "decision")), "Ship in March,Use Postgres");
  assertEqual(titles(recordsOn(c.tree, c.records, c.tree.get(1), "decision")), "Ship in March,Use Postgres,One budget",
    "an area: its own and its live projects'");
  assertEqual(titles(recordsOn(c.tree, c.records, c.tree.get(20), "decision")), "Ship in March");
  assertEqual(titles(recordsOn(c.tree, c.records, c.tree.get(10), "decision")), "Use Postgres,One budget,Old call",
    "a person's: archived last");
  assertEqual(peopleOf(c.tree, c.records, 30).map((p) => p.title).join(), "Bob Lee,Jane Doe", "by name, missing skipped");
  const rows = tab("decisions").rows(c, c.tree.get(1));
  assertEqual(rows.map((r) => r.detail).join("|"),
    "2026-11-24 · on Rollout · from Kickoff|2026-11-20 · on Rollout · Bob Lee, Jane Doe|2026-11-18 · Jane Doe");
  const mine = tab("decisions").rows(c, c.tree.get(10));
  assertEqual(mine[2].detail, "2025-01-01 · Old plan · Jane Doe · archived");
  assertTrue(mine[2].muted && !mine[0].muted);
  assertEqual(tab("decisions").rows(c, c.tree.get(20))[0].detail, "2026-11-24", "a meeting doesn't name itself");
});

test("records: questions open first (oldest first), then answered (newest answer first)", () => {
  const c = ctx();
  assertEqual(titles(recordsOn(c.tree, c.records, c.tree.get(2), "question")), "Which region?,Who owns the feed?,Budget?,Hosting?");
  const rows = tab("questions").rows(c, c.tree.get(2));
  assertEqual(rows.map((r) => r.detail).join("|"),
    "open · asked 2026-11-10|open · asked 2026-11-19 · Jane Doe|answered 2026-11-25 · from Kickoff|answered 2026-11-02");
  assertEqual(rows.map((r) => Boolean(r.muted)).join(), "false,false,true,true");
  assertEqual(tab("questions").empty(c.tree.get(2)), "No questions in this project yet");
});

function fakeApp(currentId) {
  const calls = [];
  const app = {
    tree: new NoteTree(NOTES),
    meetings: new Meetings(MEETINGS),
    records: new Records(RECORDS),
    currentId,
    today: () => TODAY,
    messages: [],
    editor: { showMessage: (text) => app.messages.push(text) },
    refreshTree: async () => calls.push("refresh"),
    saveBeforeSwitching: async () => true,
    open: async (id) => calls.push(`open ${id}`),
    peopleApi: { create: async (name) => { calls.push(`person ${name}`); return { note: { id: 50, title: name } }; } },
    recordsApi: {
      create: async (parent, kind, title, day) => { calls.push(`create ${parent} ${kind} ${title} ${day}`); return { note: { id: 60, title } }; },
      date: async (id, day) => calls.push(`date ${id} ${day}`),
      answer: async (id, day) => { calls.push(`answer ${id} ${day}`); return { answered: day }; },
      reopen: async (id) => calls.push(`reopen ${id}`),
      involve: async (id, ids) => { calls.push(`with ${id} ${ids}`); return { added: ids.filter((each) => !RECORDS.find((r) => r.id === id).people.includes(each)) }; },
      uninvolve: async (id, person) => calls.push(`unwith ${id} ${person}`),
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

test("record commands: :decision and :question go under the hub or the meeting", async () => {
  assertEqual(JSON.stringify(splitDay("yesterday Freeze scope", TODAY)), '{"day":"2026-11-20","rest":"Freeze scope"}');
  for (const name of ["decision", "question", "answered", "reopen", "with", "dropwith"]) {
    assertTrue(NOTE_COMMANDS.some((c) => c.name === name), name);
  }
  let { app, calls } = fakeApp(25);
  await runNoteCommand(app, { name: "decision", arg: "Use Kafka" });
  assertEqual(calls.join(";"), "create 2 decision Use Kafka 2026-11-21;refresh;open 60");
  assertEqual(app.messages.pop(), 'Decision "Use Kafka" made in Rollout');
  ({ app, calls } = fakeApp(20));
  await runNoteCommand(app, { name: "question", arg: "Who signs off?" });
  assertEqual(calls[0], "create 20 question Who signs off? 2026-11-24", "from the meeting, on its day");
  assertEqual(app.messages.pop(), 'Question "Who signs off?" made from Kickoff');
  ({ app, calls } = fakeApp(31));
  await runNoteCommand(app, { name: "decision", arg: "2026-11-30 Later" });
  assertEqual(calls[0], "create 20 decision Later 2026-11-30", "a note in a meeting: from that meeting");
  ({ app } = fakeApp(4));
  assertEqual(await rejects(runNoteCommand(app, { name: "decision", arg: "X" })),
    "E: a decision goes in a hub: open a project, an area or a resource (or a note in one)");
  ({ app } = fakeApp(2));
  assertEqual(await rejects(runNoteCommand(app, { name: "question", arg: "today" })), "E471: Argument required: :question [{date}] {title}");
});

test("record commands: :date, :answered, :reopen, :with and :dropwith", async () => {
  let { app, calls } = fakeApp(40);
  await runNoteCommand(app, { name: "date", arg: "2026-11-18" });
  await runNoteCommand(app, { name: "answered", arg: "" });
  await runNoteCommand(app, { name: "reopen", arg: "" });
  assertEqual(calls.join(";"), "date 40 2026-11-18;refresh;answer 40 2026-11-21;refresh;reopen 40;refresh");
  assertEqual(await rejects(runNoteCommand(app, { name: "date", arg: "today 9:00" })), 'E: a question has a date but no time ("9:00")');
  calls.length = 0;
  await runNoteCommand(app, { name: "with", arg: "jane doe, Bob Lee" });
  assertEqual(calls.join(";"), "with 40 10,11;refresh");
  assertEqual(app.messages.pop(), "Bob Lee on Who owns the feed?");
  assertEqual(await rejects(runNoteCommand(app, { name: "with", arg: "Dee Park" })),
    'E: no person "Dee Park" (:with! Dee Park adds them to People)');
  calls.length = 0;
  await runNoteCommand(app, { name: "with", arg: "Dee Park", bang: true });
  assertEqual(calls.join(";"), "person Dee Park;with 40 50;refresh");
  calls.length = 0;
  await runNoteCommand(app, { name: "dropwith", arg: "Jane Doe" });
  assertEqual(calls.join(";"), "unwith 40 10;refresh");
  ({ app } = fakeApp(30));
  assertEqual(await rejects(runNoteCommand(app, { name: "answered", arg: "" })), "E: this is a decision, not a question");
  ({ app } = fakeApp(25));
  assertEqual(await rejects(runNoteCommand(app, { name: "with", arg: "Jane Doe" })),
    "E: this note is not a decision or a question (:decision or :question {title} on a hub makes one)");
});

test("hub page: a decision has a line and no panel", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  try {
    const hub = new HubPage({ page, line, section, onOpen: () => {}, onLeave: () => {} });
    hub.show(ctx(), 30);
    assertTrue(!line.hidden && section.hidden && !hub.hasPanel && !hub.editorHidden);
    assertEqual(page.dataset.hubSize, undefined);
    assertEqual(line.textContent, "Decision·2026-11-20·in Rollout·with Bob Lee×, Jane Doe×+ Add person");
    hub.show(ctx(), 42);
    assertEqual(line.textContent, "Question·answered 2026-11-25▾·asked 2026-11-24·in Rollout·from Kickoff·no one yet+ Add person");
    hub.show(ctx(), 2);
    assertTrue(!section.hidden && hub.hasPanel);
  } finally {
    page.remove();
  }
});
