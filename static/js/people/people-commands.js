// What the people commands in static/js/notes/commands.js do. Each takes the NotesApp
// (static/js/notes/app.js) and what was typed after the command; errors are thrown for
// the app to show.
import { isHub, isMeeting, isPerson } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { findPerson, matchPerson } from "./people-model.js";

const FIELD_NAMES = { org: "Organisation", job: "Job title", email: "Email", phone: "Phone" };

/** :newperson {name} */
export async function newPersonCommand(app, arg) {
  const name = arg.trim();
  if (!name) throw new Error("E471: Argument required: the person's name");
  await makePerson(app, name);
}

/** Adds a person to People (name: one text, or { first, last }) and opens their note.
 * strict (from a dialog): an open note that can't be saved first is an error to show there.
 * open false: the note isn't opened (from @ completion). Returns the person's note. */
export async function makePerson(app, name, { strict = false, open = true } = {}) {
  if (open && !(await app.saveBeforeSwitching())) {
    if (strict) throw new Error("This note's changes could not be saved first");
    return null;
  }
  const { note } = typeof name === "string"
    ? await app.peopleApi.create(name)
    : await app.peopleApi.createNamed(name.first, name.last);
  await app.refreshTree();
  if (open) await app.open(note.id);
  app.say(`"${note.title}" added to People`);
  return note;
}

/** :addperson[!] {name}[, {role}]: on a hub; again changes the role; ! makes a new person. */
export async function addPersonCommand(app, arg, bang) {
  const hub = currentHub(app);
  const { name, role } = splitNameRole(arg);
  if (!name) throw new Error("E471: Argument required: :addperson {name}, {role}");
  let person = findPerson(app.tree, name);
  let made = 0;
  if (!person) {
    if (findOtherNote(app, name)) throw new Error(`E: "${name}" is a note, not a person`);
    if (!bang) throw new Error(`E: no person "${name}" (:addperson! ${arg.trim()} makes them)`);
    const { note } = await app.peopleApi.create(name);
    person = note;
    made = 1;
  }
  await linkPerson(app, hub, person, role, made);
}

/** Puts a person on a hub with a role (again: changes the role). made: they are new in People. */
export async function linkPerson(app, hub, person, role, made = 0) {
  const { created } = await app.peopleApi.link(hub.id, person.id, role);
  await app.refreshTree();
  const as = role ? ` as ${role}` : "";
  app.say(created
    ? `${person.title} is on ${hub.title}${as}${made ? " (new in People)" : ""}`
    : `${person.title}'s role on ${hub.title} is now ${role || "none"}`);
}

/** :dropperson {name}: takes a person off the open hub. */
export async function dropPersonCommand(app, arg) {
  const hub = currentHub(app);
  const name = arg.trim();
  if (!name) throw new Error("E471: Argument required: the person to take off this hub");
  const person = findPerson(app.tree, name);
  if (!person) throw new Error(`E: no person "${name}"`);
  await unlinkPerson(app, hub, person);
}

/** Takes a person off a hub (they stay in People). */
export async function unlinkPerson(app, hub, person) {
  await app.peopleApi.unlink(hub.id, person.id);
  await app.refreshTree();
  app.say(`${person.title} is off ${hub.title}`);
}

/** :org / :job / :email / :phone {text}: on a person's note; with no text, clears it. */
export async function fieldCommand(app, field, arg) {
  const id = app.currentId;
  if (!isPerson(app.tree, id)) throw new Error(`E: this note is not a person (:newperson {name} adds one)`);
  const value = arg.trim();
  await app.peopleApi.update(id, field, value);
  await app.refreshTree();
  app.say(value ? `${FIELD_NAMES[field]}: ${value}` : `${FIELD_NAMES[field]} cleared`);
}

/**
 * The people with these names, for :attendee, :with and the person dialogs. A name means who
 * matchPerson says ("dana" is Dana Northwind when she is the only one); one that matches
 * several people is an error, so no duplicate is made. A name that matches no one is an
 * error, unless bang: then they are added to People. usage is the command for the hint
 * (":attendee"). Returns { people: [note], made: how many were added }.
 */
export async function peopleNamed(app, names, bang, usage) {
  const found = names.map((name) => ({ name, ...matchPerson(app.tree, name) }));
  const unclear = found.find((each) => !each.person && each.matches.length > 1);
  if (unclear) throw new Error(`E: ${unclear.matches.length} people match "${unclear.name}": type more`);
  const missing = found.filter((each) => !each.person).map((each) => each.name);
  const notPeople = missing.filter((name) => findOtherNote(app, name));
  if (notPeople.length) throw new Error(`E: "${notPeople[0]}" is a note, not a person`);
  if (missing.length && !bang) throw new Error(`E: no person "${missing[0]}" (${usage}! ${names.join(", ")} adds them to People)`);
  for (const each of found) {
    if (!each.person) each.person = (await app.peopleApi.create(each.name)).note;
  }
  return { people: found.map((each) => each.person), made: missing.length };
}

/** "Jane Doe, Sponsor" -> { name: "Jane Doe", role: "Sponsor" } (the first comma splits). */
export function splitNameRole(arg) {
  const text = String(arg ?? "");
  const at = text.indexOf(",");
  if (at < 0) return { name: text.trim(), role: "" };
  return { name: text.slice(0, at).trim(), role: text.slice(at + 1).trim() };
}

function currentHub(app) {
  const id = app.currentId;
  if (isMeeting(app.tree, id)) throw new Error("E: on a meeting, :attendee {name} says who attended");
  if (!isHub(app.tree, id)) throw new Error("E: people go on a hub: open a project or an area");
  return app.tree.get(id);
}

function findOtherNote(app, name) {
  return app.tree.children(null).some((note) => titleKey(note.title) === titleKey(name));
}
