// What the decision and question commands in static/js/notes/commands.js do. Each takes the
// NotesApp (static/js/notes/app.js) and what was typed after the command; errors are thrown
// for the app to show. app.today() is the local day's Date.
import { localDay, parseDay } from "../meetings/meeting-days.js";
import { splitNames } from "../meetings/meetings-commands.js";
import { shortTitle } from "../meetings/meetings-model.js";
import { hubOf, isDecisionOrQuestion, isHub, isMeeting, meetingOf } from "../notes/hub-groups.js";
import { screenNoteId } from "../notes/screen-note.js";
import { titleKey } from "../notes/titles.js";
import { peopleNamed } from "../people/people-commands.js";
import { findPerson } from "../people/people-model.js";
import { peopleOf } from "./records-model.js";

const WHAT = { decision: "decision", question: "question" };

/** :decision / :question [{date}] {title}: under the open meeting (or the meeting the note is
 * in), dated the meeting's day; else under the open note's hub, dated today. */
export async function newRecordCommand(app, kind, arg) {
  const id = screenNoteId(app);
  const hub = hubOf(app.tree, id);
  if (!hub) throw new Error(`E: a ${WHAT[kind]} goes in a hub: open a project or an area (or a note in one)`);
  const meeting = isMeeting(app.tree, id) ? app.tree.get(id) : meetingOf(app.tree, id);
  const { day, rest } = splitDay(arg, app.today());
  if (!rest) throw new Error(`E471: Argument required: :${kind} [{date}] {title}`);
  await makeRecord(app, kind, meeting ?? app.tree.get(id), rest, day ?? defaultDay(app, meeting));
}

/** The day a new record gets: its meeting's, else today. */
export function defaultDay(app, meeting) {
  return (meeting ? app.meetings.get(meeting.id).day : "") || localDay(app.today());
}

/**
 * Makes a decision or question in parent's hub (parent: a hub, or a note or meeting in one,
 * which it then came from) and opens it; peopleIds are on it from the start. strict (from a
 * dialog): an open note that can't be saved first is an error to show there.
 */
export async function makeRecord(app, kind, parent, title, day, { peopleIds = [], strict = false } = {}) {
  if (!(await app.saveBeforeSwitching())) {
    if (strict) throw new Error("This note's changes could not be saved first");
    return;
  }
  const { note } = await app.recordsApi.create(parent.id, kind, title, day);
  if (peopleIds.length) await app.recordsApi.involve(note.id, peopleIds);
  await app.refreshTree();
  await app.open(note.id);
  const name = isMeeting(app.tree, parent.id) ? shortTitle(parent, app.meetings.get(parent.id)) : parent.title;
  const from = isHub(app.tree, parent.id) ? `in ${parent.title}` : `from ${name}`;
  app.say(`${capital(WHAT[kind])} "${note.title}" made ${from}`);
}

/**
 * A decision or question made from text selected in a note (or a meeting): it goes in the
 * note's hub, remembers the note and the text, and the note stays open. Returns the record's
 * note.
 */
export async function recordFromText(app, kind, sourceId, title, day, quote, peopleIds = []) {
  const { note } = await app.recordsApi.create(sourceId, kind, title, day, { sourceId, quote });
  if (peopleIds.length) await app.recordsApi.involve(note.id, peopleIds);
  await app.refreshTree();
  const hub = hubOf(app.tree, note.id);
  app.say(`${capital(WHAT[kind])} "${note.title}" added to ${hub?.title ?? "its hub"}`);
  return note;
}

/** :date {date} on a decision or question. */
export async function recordDateCommand(app, arg) {
  const id = currentRecord(app);
  const { day, rest } = splitDay(arg, app.today());
  if (!day) throw new Error("E471: Argument required: :date {date}, like :date 2026-11-24");
  if (rest) throw new Error(`E: a ${app.tree.get(id).kind} has a date but no time ("${rest}")`);
  await setRecordDay(app, id, day);
}

/** Sets a decision's or question's day ("YYYY-MM-DD"). */
export async function setRecordDay(app, id, day) {
  await app.recordsApi.date(id, day);
  await recordChanged(app);
  app.say(`"${app.tree.get(id).title}" is dated ${day}`);
}

/** :answered [{date}]: the open question is answered (today if no date). */
export async function answeredCommand(app, arg) {
  const id = currentQuestion(app);
  const { day, rest } = splitDay(arg, app.today());
  if (rest) throw new Error(`E: "${rest}" is not a date like 2026-11-24 (the answer goes in the note)`);
  await answerQuestion(app, id, day ?? localDay(app.today()));
}

/** Marks a question answered on a day ("YYYY-MM-DD"); text, if any, is added to its note. */
export async function answerQuestion(app, id, day, text = "") {
  const open = app.currentId === id && text.trim();
  // The server writes the answer into the note: what is typed there goes first, and the
  // note is read again after.
  if (open && !(await app.saveBeforeSwitching())) throw new Error("This note's changes could not be saved first");
  const record = await app.recordsApi.answer(id, day, text);
  await recordChanged(app);
  if (open) await app.open(id, { discard: true, history: "none" });
  app.say(`"${app.tree.get(id).title}" answered ${record.answered}`);
}

/** :reopen: the open question is open again. */
export async function reopenCommand(app) {
  await reopenQuestion(app, currentQuestion(app));
}

export async function reopenQuestion(app, id) {
  await app.recordsApi.reopen(id);
  await recordChanged(app);
  app.say(`"${app.tree.get(id).title}" is open again`);
}

/** :with[!] {name}[, {name}...]: these people are on the open decision or question. */
export async function withCommand(app, arg, bang) {
  const id = currentRecord(app);
  const names = splitNames(arg);
  if (!names.length) throw new Error("E471: Argument required: :with {name}, {name}...");
  await addPeopleTo(app, id, await peopleNamed(app, names, bang, ":with"));
}

/** Puts people ({ people: [notes], made: how many are new }, as peopleNamed gives them) on a
 * decision or question. */
export async function addPeopleTo(app, id, { people, made }) {
  const { added } = await app.recordsApi.involve(id, people.map((person) => person.id));
  await app.refreshTree();
  const title = (personId) => people.find((person) => person.id === personId).title;
  const news = made ? ` (${made} new in People)` : "";
  app.say(added.length
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
  await dropPersonFrom(app, id, person);
}

export async function dropPersonFrom(app, id, person) {
  await app.recordsApi.uninvolve(id, person.id);
  await app.refreshTree();
  app.say(`${person.title} is off ${app.tree.get(id).title}`);
}

/** "2026-11-18 Freeze scope" -> { day: "2026-11-18", rest: "Freeze scope" }; day is null
 * when the first word isn't a date. */
export function splitDay(arg, today) {
  const words = String(arg ?? "").trim().split(/\s+/).filter(Boolean);
  const day = parseDay(words[0], today);
  if (day) words.shift();
  return { day, rest: words.join(" ") };
}

// A record changed: this window's tree, then the other window's (on Live the record is the
// note window's note, and an answer's text is written into its body).
async function recordChanged(app) {
  await app.refreshTree();
  app.changes?.send({ type: "changed", what: ["notes", "records"] });
}

function currentRecord(app) {
  const id = screenNoteId(app);
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
