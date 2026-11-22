// What the decision and question commands in static/js/notes/commands.js do. Each takes the
// NotesApp (static/js/notes/app.js) and what was typed after the command; errors are thrown
// for the app to show. app.today() is the local day's Date.
import { localDay, parseDay } from "../meetings/meeting-days.js";
import { splitNames } from "../meetings/meetings-commands.js";
import { shortTitle } from "../meetings/meetings-model.js";
import { hubOf, isDecisionOrQuestion, meetingOf } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { peopleNamed } from "../people/people-commands.js";
import { findPerson } from "../people/people-model.js";
import { peopleOf } from "./records-model.js";

const WHAT = { decision: "decision", question: "question" };

/** :decision / :question [{date}] {title}: under the open meeting (or the meeting the note is
 * in), dated the meeting's day; else under the open note's hub, dated today. */
export async function newRecordCommand(app, kind, arg) {
  const id = app.currentId;
  const hub = hubOf(app.tree, id);
  if (!hub) throw new Error(`E: a ${WHAT[kind]} goes in a hub: open a project, an area or a resource (or a note in one)`);
  const meeting = app.tree.get(id)?.kind === "meeting" ? app.tree.get(id) : meetingOf(app.tree, id);
  const { day, rest } = splitDay(arg, app.today());
  if (!rest) throw new Error(`E471: Argument required: :${kind} [{date}] {title}`);
  const meetingDay = meeting ? app.meetings.get(meeting.id).day : "";
  if (!(await app.saveBeforeSwitching())) return;
  const parent = meeting ?? hub;
  const { note } = await app.recordsApi.create(parent.id, kind, rest, day ?? (meetingDay || localDay(app.today())));
  await app.refreshTree();
  await app.open(note.id);
  const from = meeting ? `from ${shortTitle(meeting, app.meetings.get(meeting.id))}` : `in ${hub.title}`;
  app.editor.showMessage(`${capital(WHAT[kind])} "${note.title}" made ${from} (:with {name}, {name}... adds people)`);
}

/** :date {date} on a decision or question. */
export async function recordDateCommand(app, arg) {
  const id = currentRecord(app);
  const { day, rest } = splitDay(arg, app.today());
  if (!day) throw new Error("E471: Argument required: :date {date}, like :date 2026-11-24");
  if (rest) throw new Error(`E: a ${app.tree.get(id).kind} has a date but no time ("${rest}")`);
  await app.recordsApi.date(id, day);
  await app.refreshTree();
  app.editor.showMessage(`"${app.tree.get(id).title}" is dated ${day}`);
}

/** :answered [{date}]: the open question is answered (today if no date). */
export async function answeredCommand(app, arg) {
  const id = currentQuestion(app);
  const { day, rest } = splitDay(arg, app.today());
  if (rest) throw new Error(`E: "${rest}" is not a date like 2026-11-24 (the answer goes in the note)`);
  const record = await app.recordsApi.answer(id, day ?? localDay(app.today()));
  await app.refreshTree();
  app.editor.showMessage(`"${app.tree.get(id).title}" answered ${record.answered} (:reopen opens it again)`);
}

/** :reopen: the open question is open again. */
export async function reopenCommand(app) {
  const id = currentQuestion(app);
  await app.recordsApi.reopen(id);
  await app.refreshTree();
  app.editor.showMessage(`"${app.tree.get(id).title}" is open again`);
}

/** :with[!] {name}[, {name}...]: these people are on the open decision or question. */
export async function withCommand(app, arg, bang) {
  const id = currentRecord(app);
  const names = splitNames(arg);
  if (!names.length) throw new Error("E471: Argument required: :with {name}, {name}...");
  const { people, made } = await peopleNamed(app, names, bang, ":with");
  const { added } = await app.recordsApi.involve(id, people.map((person) => person.id));
  await app.refreshTree();
  const title = (personId) => people.find((person) => person.id === personId).title;
  const news = made ? ` (${made} new in People)` : "";
  app.editor.showMessage(added.length
    ? `${added.map(title).join(", ")} on ${app.tree.get(id).title}${news}`
    : "They are all on it already");
}

/** :dropwith {name} */
export async function dropWithCommand(app, arg) {
  const id = currentRecord(app);
  const name = arg.trim();
  if (!name) throw new Error("E471: Argument required: the person to take off");
  const person = peopleOf(app.tree, app.records, id).find((each) => titleKey(each.title) === titleKey(name))
    ?? findPerson(app.tree, name);
  if (!person) throw new Error(`E: no person "${name}"`);
  await app.recordsApi.uninvolve(id, person.id);
  await app.refreshTree();
  app.editor.showMessage(`${person.title} is off ${app.tree.get(id).title}`);
}

/** "2026-11-18 Freeze scope" -> { day: "2026-11-18", rest: "Freeze scope" }; day is null
 * when the first word isn't a date. */
export function splitDay(arg, today) {
  const words = String(arg ?? "").trim().split(/\s+/).filter(Boolean);
  const day = parseDay(words[0], today);
  if (day) words.shift();
  return { day, rest: words.join(" ") };
}

function currentRecord(app) {
  const id = app.currentId;
  if (!isDecisionOrQuestion(app.tree, id)) {
    throw new Error("E: this note is not a decision or a question (:decision or :question {title} on a hub makes one)");
  }
  return id;
}

function currentQuestion(app) {
  const id = currentRecord(app);
  if (app.tree.get(id).kind !== "question") throw new Error("E: this is a decision, not a question");
  return id;
}

function capital(text) {
  return text[0].toUpperCase() + text.slice(1);
}
