// What the people commands in static/js/notes/commands.js do. Each takes the NotesApp
// (static/js/notes/app.js) and what was typed after the command; errors are thrown for
// the app to show.
import { isHub, isMeeting, isPerson } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { findPerson } from "./people-model.js";

const FIELD_NAMES = { org: "Organisation", job: "Job title", email: "Email" };

/** :newperson {name} */
export async function newPersonCommand(app, arg) {
  const name = arg.trim();
  if (!name) throw new Error("E471: Argument required: the person's name");
  if (!(await app.saveBeforeSwitching())) return;
  const { note } = await app.peopleApi.create(name);
  await app.refreshTree();
  await app.open(note.id);
  app.editor.showMessage(`"${note.title}" added to People (:org, :job, :email fill in the details)`);
}

/** :addperson[!] {name}[, {role}]: on a hub; again changes the role; ! makes a new person. */
export async function addPersonCommand(app, arg, bang) {
  const hub = currentHub(app);
  const { name, role } = splitNameRole(arg);
  if (!name) throw new Error("E471: Argument required: :addperson {name}, {role}");
  let person = findPerson(app.tree, name);
  let made = "";
  if (!person) {
    if (findOtherNote(app, name)) throw new Error(`E: "${name}" is a note, not a person`);
    if (!bang) throw new Error(`E: no person "${name}" (:addperson! ${arg.trim()} makes them)`);
    const { note } = await app.peopleApi.create(name);
    person = note;
    made = " (new in People)";
  }
  const { created } = await app.peopleApi.link(hub.id, person.id, role);
  await app.refreshTree();
  const as = role ? ` as ${role}` : "";
  app.editor.showMessage(created
    ? `${person.title} is on ${hub.title}${as}${made}`
    : `${person.title}'s role on ${hub.title} is now ${role || "none"}`);
}

/** :dropperson {name}: takes a person off the open hub. */
export async function dropPersonCommand(app, arg) {
  const hub = currentHub(app);
  const name = arg.trim();
  if (!name) throw new Error("E471: Argument required: the person to take off this hub");
  const person = findPerson(app.tree, name);
  if (!person) throw new Error(`E: no person "${name}"`);
  await app.peopleApi.unlink(hub.id, person.id);
  await app.refreshTree();
  app.editor.showMessage(`${person.title} is off ${hub.title}`);
}

/** :org / :job / :email {text}: on a person's note; with no text, clears it. */
export async function fieldCommand(app, field, arg) {
  const id = app.currentId;
  if (!isPerson(app.tree, id)) throw new Error(`E: this note is not a person (:newperson {name} adds one)`);
  const value = arg.trim();
  await app.peopleApi.update(id, field, value);
  await app.refreshTree();
  app.editor.showMessage(value ? `${FIELD_NAMES[field]}: ${value}` : `${FIELD_NAMES[field]} cleared`);
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
  if (!isHub(app.tree, id)) throw new Error("E: people go on a hub: open a project, an area or a resource");
  return app.tree.get(id);
}

function findOtherNote(app, name) {
  return app.tree.children(null).some((note) => titleKey(note.title) === titleKey(name));
}
