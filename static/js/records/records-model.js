// Decisions and questions read together with the notes tree. A record's title, place and
// archived state are its note's (in the tree); its day, answer day and people come from
// /api/records. Its hub is its top-level note, and it counts only while that is a hub; one
// under a meeting came from that meeting. Pure.
//
//   const records = new Records(await recordsApi.list());
//   records.get(id)                         { id, kind, day, people: [person ids], answered }
//   recordsOn(tree, records, owner, kind)   [entry] for a hub (an area: its projects' too), a
//                                           meeting (the ones under it) or a person (the
//                                           ones they're on); entry: { note, record, hub,
//                                           meeting, archived }
//   peopleOf(tree, records, id)             their notes, by name
//   isOpen(record)                          a question not answered yet
//   allOfKind(tree, records, kind)          every entry of a kind, unsorted; questionOrder
// Decisions come newest first; questions open first (oldest first: they've waited longest),
// then answered ones (newest answer first). Those in archived hubs come last.
import { hubOf, isArchived, isPerson, meetingOf } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { hubScope } from "../people/people-model.js";

const NO_RECORD = Object.freeze({ kind: "", day: "", people: [], answered: "" });

export class Records {
  constructor(list = []) {
    this.byId = new Map(list.map((record) => [record.id, { answered: "", ...record }]));
  }

  /** The record; no day and no one when the list hasn't caught up. */
  get(id) {
    return this.byId.get(id) ?? { ...NO_RECORD, id };
  }
}

export function isOpen(record) {
  return !record.answered;
}

/** Every decision (or question) in a hub, unsorted (archived ones too). */
export function allOfKind(tree, records, kind) {
  return tree.inOrder()
    .filter((note) => note.kind === kind && hubOf(tree, note.id))
    .map((note) => ({
      note,
      record: records.get(note.id),
      hub: hubOf(tree, note.id),
      meeting: meetingOf(tree, note.id),
      archived: isArchived(tree, note.id),
    }));
}

export function recordsOn(tree, records, owner, kind) {
  const entries = allOfKind(tree, records, kind).filter(belongsTo(tree, owner));
  const order = kind === "question" ? questionOrder : newestFirst;
  const sorted = entries.sort(order);
  return [...sorted.filter((entry) => !entry.archived), ...sorted.filter((entry) => entry.archived)];
}

function belongsTo(tree, owner) {
  if (owner.kind === "person") return (entry) => entry.record.people.includes(owner.id);
  if (owner.kind === "meeting") return (entry) => tree.path(entry.note.id).some((note) => note.id === owner.id);
  const scope = hubScope(tree, owner.id);
  return (entry) => scope.includes(entry.hub.id);
}

export function peopleOf(tree, records, id) {
  return records.get(id).people
    .filter((personId) => isPerson(tree, personId))
    .map((personId) => tree.get(personId))
    .sort((a, b) => titleKey(a.title).localeCompare(titleKey(b.title)));
}

function newestFirst(a, b) {
  return b.record.day.localeCompare(a.record.day) || byTitle(a, b);
}

/** The Questions tab's order: open first (oldest first), then answered (newest answer first). */
export function questionOrder(a, b) {
  const open = (entry) => (isOpen(entry.record) ? 0 : 1);
  if (open(a) !== open(b)) return open(a) - open(b);
  if (isOpen(a.record)) return a.record.day.localeCompare(b.record.day) || byTitle(a, b);
  return b.record.answered.localeCompare(a.record.answered) || byTitle(a, b);
}

function byTitle(a, b) {
  return titleKey(a.note.title).localeCompare(titleKey(b.note.title));
}
