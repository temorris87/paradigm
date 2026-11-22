// Decisions and questions read together with the notes tree. A record's title, place and
// archived state are its note's (in the tree); its day, answer day and people come from
// /api/records. Its hub is its top-level note (it sits directly under it), and it counts only
// while that is a hub. It came from its source note (source_id): a meeting, or a note in the
// hub where its text was selected (quote). Pure.
//
//   const records = new Records(await recordsApi.list());
//   records.get(id)                         { id, kind, day, people: [person ids], answered,
//                                           source_id, quote, quote_found }
//   recordsOn(tree, records, owner, kind)   [entry] for a hub (its own: an area never lists
//                                           its projects', they roll up to the project only),
//                                           a meeting (the ones from it), a phase or a note
//                                           (the ones made from text inside it) or a person
//                                           (the ones they're on); entry: { note, record, hub,
//                                           meeting, source, archived }
//   recordsFrom(tree, records, sourceId)    the records made from a note, for its highlights
//   peopleOf(tree, records, id)             their notes, by name
//   isOpen(record)                          a question not answered yet
//   allOfKind(tree, records, kind)          every entry of a kind, unsorted; questionOrder
// Decisions come newest first; questions open first (oldest first: they've waited longest),
// then answered ones (newest answer first). Those in archived hubs come last.
import { hubOf, isArchived, isMeeting, isPerson, meetingOf } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";

const NO_RECORD = Object.freeze({ kind: "", day: "", people: [], answered: "", source_id: null, quote: "", quote_found: false });

export class Records {
  constructor(list = []) {
    this.byId = new Map(list.map((record) => [record.id, { ...NO_RECORD, ...record }]));
  }

  all() {
    return [...this.byId.values()];
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
    .map((note) => {
      const record = records.get(note.id);
      const source = tree.get(record.source_id);
      return {
        note,
        record,
        hub: hubOf(tree, note.id),
        source,
        meeting: source && (isMeeting(tree, source.id) ? source : meetingOf(tree, source.id)),
        archived: isArchived(tree, note.id),
      };
    });
}

export function recordsFrom(tree, records, sourceId) {
  return records.all().filter((record) => record.source_id === sourceId && tree.has(record.id));
}

export function recordsOn(tree, records, owner, kind) {
  const entries = allOfKind(tree, records, kind).filter(belongsTo(tree, owner));
  const order = kind === "question" ? questionOrder : newestFirst;
  const sorted = entries.sort(order);
  return [...sorted.filter((entry) => !entry.archived), ...sorted.filter((entry) => entry.archived)];
}

function belongsTo(tree, owner) {
  if (owner.kind === "person") return (entry) => entry.record.people.includes(owner.id);
  if (owner.kind === "meeting") return (entry) => entry.meeting?.id === owner.id;
  if (tree.parentId(owner.id) === null) return (entry) => entry.hub.id === owner.id;
  const inside = new Set([owner.id, ...tree.inOrder(owner.id).map((note) => note.id)]);
  return (entry) => Boolean(entry.source && inside.has(entry.source.id));
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
