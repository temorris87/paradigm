// What the meeting commands in static/js/notes/commands.js do. Each takes the NotesApp
// (static/js/notes/app.js) and what was typed after the command; errors are thrown for the
// app to show. app.today() is the local day's Date.
import { hubOf, isMeeting } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { peopleNamed } from "../people/people-commands.js";
import { findPerson } from "../people/people-model.js";
import { parseDay, parseTime, whenText } from "./meeting-days.js";
import { attendeesOf } from "./meetings-model.js";

/** :meeting [{date}] [{time}] {title}: a meeting in the open note's hub, dated today unless
 * a date is given. */
export async function newMeetingCommand(app, arg) {
  const hub = hubOf(app.tree, app.currentId);
  if (!hub) throw new Error("E: meetings go in a hub: open a project, an area or a resource (or a note in one)");
  const { day, time, rest } = splitWhen(arg, app.today());
  if (!rest) throw new Error("E471: Argument required: :meeting [{date}] [{time}] {title}");
  if (!(await app.saveBeforeSwitching())) return;
  const { note } = await app.meetingsApi.create(hub.id, rest, day ?? localToday(app), time ?? "");
  await app.refreshTree();
  await app.open(note.id);
  app.editor.showMessage(`"${note.title}" made in ${hub.title}`);
}

/** :date {date} [{time}]: sets the open meeting's date and time (no time: none). */
export async function dateCommand(app, arg) {
  const id = currentMeeting(app);
  const { day, time, rest } = splitWhen(arg, app.today());
  if (!day) throw new Error("E471: Argument required: :date {date} [{time}], like :date 2026-11-24 14:00");
  if (rest) throw new Error(`E: "${rest}" is not a time like 14:30`);
  await setMeetingWhen(app, id, day, time ?? "");
}

/** Sets a meeting's day ("YYYY-MM-DD") and time ("HH:MM", "" for none). */
export async function setMeetingWhen(app, id, day, time) {
  const { note, meeting } = await app.meetingsApi.update(id, day, time);
  if (note.id === app.currentId) app.session.updateMeta(note);
  await app.refreshTree();
  app.editor.showMessage(`"${note.title}" is on ${whenText(meeting)}`);
}

/** :attendee[!] {name}[, {name}...]: they attend the open meeting; ! adds new people. */
export async function attendeeCommand(app, arg, bang) {
  const id = currentMeeting(app);
  const names = splitNames(arg);
  if (!names.length) throw new Error("E471: Argument required: :attendee {name}, {name}...");
  const { people, made } = await peopleNamed(app, names, bang, ":attendee");
  const { added } = await app.meetingsApi.attend(id, people.map((person) => person.id));
  await app.refreshTree();
  const title = (personId) => people.find((person) => person.id === personId).title;
  const news = made ? ` (${made} new in People)` : "";
  app.editor.showMessage(added.length
    ? `${added.map(title).join(", ")} attending ${app.tree.get(id).title}${news}`
    : "They are all attending already");
}

/** :dropattendee {name} */
export async function dropAttendeeCommand(app, arg) {
  const id = currentMeeting(app);
  const name = arg.trim();
  if (!name) throw new Error("E471: Argument required: the person who did not attend");
  const person = attendeesOf(app.tree, app.meetings, id).find((each) => titleKey(each.title) === titleKey(name))
    ?? findPerson(app.tree, name);
  if (!person) throw new Error(`E: no person "${name}"`);
  await app.meetingsApi.unattend(id, person.id);
  await app.refreshTree();
  app.editor.showMessage(`${person.title} is off ${app.tree.get(id).title}`);
}

/** "tomorrow 9:30 Kickoff" -> { day, time: "09:30", rest: "Kickoff" }: a leading date, then a
 * time, each optional (null when not there). */
export function splitWhen(arg, today) {
  const words = String(arg ?? "").trim().split(/\s+/).filter(Boolean);
  const day = parseDay(words[0], today);
  if (day) words.shift();
  const time = parseTime(words[0]);
  if (time) words.shift();
  return { day, time, rest: words.join(" ") };
}

/** "Jane Doe, Bob Lee," -> ["Jane Doe", "Bob Lee"] */
export function splitNames(arg) {
  return String(arg ?? "").split(",").map((name) => name.trim()).filter(Boolean);
}

function currentMeeting(app) {
  const id = app.currentId;
  if (!isMeeting(app.tree, id)) throw new Error("E: this note is not a meeting (:meeting {title} on a hub makes one)");
  return id;
}

function localToday(app) {
  return parseDay("today", app.today());
}
