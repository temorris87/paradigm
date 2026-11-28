// People read together with the notes tree. A person's name and archived state are their
// note's (in the tree); their fields and hub links come from /api/people. A link counts only
// while its hub is a hub (the server keeps the rest), and a trashed person is in neither.
// Pure.
//
//   const people = new People(await peopleApi.list());
//   people.get(id)                           { id, org, job, email, hubs: [{ hub_id, role }] }
//   hubLinks(tree, people, personId)         the hubs a person is on, with roles
//   peopleOn(tree, people, hub)              who is on a hub (an area: its projects too)
//   filterPeople(tree, people, filters)      the People page's list
//   filterOptions(tree, people)              what its dropdowns offer
//   matchPerson(tree, text)                  who a typed name means: { person, matches }
//   personLabel(tree, text, labels)          a person field's submit button: { text, blocked }
//   SORTS, sortPeople(entries, sort)         the People page's Sort: most overdue, name, next
//                                            together
//   footnoteText({ view, sort, idle })       the line under the People page's list
import { projectsIn } from "../hubs/hub-areas.js";
import { isArchived, isHub, isPerson } from "../notes/hub-groups.js";
import { NoteTree } from "../notes/tree-model.js";
import { titleKey } from "../notes/titles.js";

const NO_PERSON = Object.freeze({ org: "", job: "", email: "", hubs: [] });

export class People {
  constructor(list = []) {
    this.byId = new Map(list.map((person) => [person.id, person]));
  }

  /** The person's record ({ id, org, ... }); empty fields when the list hasn't caught up. */
  get(id) {
    return this.byId.get(id) ?? { ...NO_PERSON, id };
  }
}

/** Every person in the tree (their notes), sorted by name. */
export function allPeople(tree) {
  return tree.children(null).filter((note) => isPerson(tree, note.id));
}

/** The person called name (ignoring case), or null. */
export function findPerson(tree, name) {
  return NoteTree.pick(allPeople(tree), String(name ?? "").trim());
}

/**
 * Who a name typed in a person field means: { person: note | null, matches: [notes] }.
 * An exact title (ignoring case) wins. Otherwise every typed word must start a word of a live
 * person's name ("dan nor", "north": Dana Northwind); archived and trashed people don't count.
 * person is set only when one person is meant; two or more leave it null with matches listed,
 * and none (a new name) leaves both empty. "Dana Smith" matches no Dana Northwind.
 */
export function matchPerson(tree, text) {
  const exact = findPerson(tree, text);
  if (exact) return { person: exact, matches: [exact] };
  const typed = titleKey(String(text ?? "")).split(" ").filter(Boolean);
  if (!typed.length) return { person: null, matches: [] };
  const matches = allPeople(tree).filter((note) => {
    if (note.deleted_at || isArchived(tree, note.id)) return false;
    const words = titleKey(note.title).split(" ");
    return typed.every((word) => words.some((each) => each.startsWith(word)));
  });
  return { person: matches.length === 1 ? matches[0] : null, matches };
}

/**
 * The submit button of a dialog with a person field, from what is typed there:
 * labels { empty, one(person), none } give the text with nothing typed, one person meant, and a
 * new name. Two or more matches block it ({ blocked: true }), so Enter makes no duplicate.
 */
export function personLabel(tree, text, { empty, one, none }) {
  if (!String(text ?? "").trim()) return { text: empty, blocked: false };
  const { person, matches } = matchPerson(tree, text);
  if (person) return { text: one(person), blocked: false };
  if (matches.length > 1) return { text: `${matches.length} people match: type more`, blocked: true };
  return { text: none, blocked: false };
}

/** [{ hub, role }] for each hub the person is on: live hubs by title, then archived ones. */
export function hubLinks(tree, people, personId) {
  const links = people.get(personId).hubs
    .filter((link) => isHub(tree, link.hub_id))
    .map((link) => ({ hub: tree.get(link.hub_id), role: link.role, archived: isArchived(tree, link.hub_id) }));
  const byTitle = (a, b) => titleKey(a.hub.title).localeCompare(titleKey(b.hub.title));
  return [...links.filter((l) => !l.archived).sort(byTitle), ...links.filter((l) => l.archived).sort(byTitle)];
}

/** The hubs that count as "on this hub": the hub, and an area's active projects. */
export function hubScope(tree, hubId) {
  const hub = tree.get(hubId);
  if (!hub) return [];
  return hub.kind === "area" ? [hubId, ...projectsIn(tree, hubId).map((project) => project.id)] : [hubId];
}

/**
 * Who is on a hub, one entry per person, by name (archived people last):
 * [{ person: note, roles: [{ role, via: project note | null }], archived }].
 * via names the project an area's person is on (null: on the hub itself).
 */
export function peopleOn(tree, people, hub) {
  const scope = hubScope(tree, hub.id);
  const found = [];
  for (const person of allPeople(tree)) {
    const roles = people.get(person.id).hubs
      .filter((link) => scope.includes(link.hub_id))
      .map((link) => ({ role: link.role, via: link.hub_id === hub.id ? null : tree.get(link.hub_id) }))
      .sort((a, b) => (a.via ? 1 : 0) - (b.via ? 1 : 0) || titleKey(a.via?.title ?? "").localeCompare(titleKey(b.via?.title ?? "")));
    if (roles.length) found.push({ person, roles, archived: isArchived(tree, person.id) });
  }
  return [...found.filter((each) => !each.archived), ...found.filter((each) => each.archived)];
}

/** "Sponsor · Lead on Rollout · on Pilot": a person's roles on a hub, as one line. */
export function rolesText(roles) {
  return roles.map(({ role, via }) => {
    if (!via) return role;
    return role ? `${role} on ${via.title}` : `on ${via.title}`;
  }).filter(Boolean).join(" · ");
}

/** "Northwind · Data engineer": the fields that are set, without the email. */
export function workText(person) {
  return [person.org, person.job].filter(Boolean).join(" · ");
}

/**
 * The People page's list: people who match every filter that is set.
 * filters: { hubId: number | null, role: string, org: string, name: string }
 * With a hub and a role, the role must be on that hub (an area: on it or its projects).
 * Archived people are left out.
 */
export function filterPeople(tree, people, { hubId = null, role = "", org = "", name = "" } = {}) {
  const scope = hubId === null ? null : hubScope(tree, hubId);
  const wanted = titleKey(name.trim());
  return allPeople(tree).filter((note) => {
    if (isArchived(tree, note.id)) return false;
    const person = people.get(note.id);
    if (org && person.org !== org) return false;
    if (wanted && !titleKey(note.title).includes(wanted)) return false;
    const links = person.hubs.filter((link) => isHub(tree, link.hub_id) && (!scope || scope.includes(link.hub_id)));
    if (scope && !links.length) return false;
    if (role && !links.some((link) => link.role === role)) return false;
    return true;
  });
}

/**
 * What the dropdowns offer: { hubs: [hub notes], roles: [text], orgs: [text] }. Hubs are the
 * live hubs anyone is on (an area also when only its projects have people); roles and
 * organisations are the ones in use. All sorted.
 */
export function filterOptions(tree, people) {
  const linked = new Set();
  const roles = new Set();
  const orgs = new Set();
  for (const note of allPeople(tree)) {
    const person = people.get(note.id);
    if (person.org) orgs.add(person.org);
    for (const link of person.hubs) {
      if (!isHub(tree, link.hub_id)) continue;
      linked.add(link.hub_id);
      if (link.role) roles.add(link.role);
    }
  }
  const hubs = tree.children(null).filter((note) => isHub(tree, note.id) && !isArchived(tree, note.id)
    && hubScope(tree, note.id).some((id) => linked.has(id)));
  const sorted = (set) => [...set].sort((a, b) => titleKey(a).localeCompare(titleKey(b)));
  return { hubs, roles: sorted(roles), orgs: sorted(orgs) };
}

// The People page's Sort dropdown, the first the default.
export const SORTS = [["overdue", "most overdue"], ["name", "name"], ["next", "next together"]];

const SORT_WORDS = { overdue: "most overdue first", name: "by name", next: "next together first" };

/**
 * People in a Sort's order. entries: [{ note, lateDays, earliest, next }]: the most days late of
 * what they owe me or I owe them, the earliest follow-up or due day ("" none), and when we next
 * meet ("YYYY-MM-DD HH:MM", "" none). Most overdue: most days late first, then the earliest
 * day, then name; next together: the soonest first, no meeting last, then name.
 */
export function sortPeople(entries, sort = "overdue") {
  const name = (a, b) => titleKey(a.note.title).localeCompare(titleKey(b.note.title));
  const day = (a, b) => (a || "9999").localeCompare(b || "9999");
  const order = {
    overdue: (a, b) => b.lateDays - a.lateDays || day(a.earliest, b.earliest) || name(a, b),
    next: (a, b) => day(a.next, b.next) || name(a, b),
    name,
  }[sort] ?? name;
  return [...entries].sort(order);
}

/** "Ann, Bob and Cy"; past three, "Ann, Bob, Cy and 2 others". */
function namesText(names) {
  if (names.length <= 1) return names.join("");
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const rest = names.length - 3;
  return `${names.slice(0, 3).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/**
 * "Showing people with something open, most overdue first. Ann and Bob have nothing open
 * (o shows everyone)". view: "open" | "everyone"; idle: the names of who has nothing open.
 */
export function footnoteText({ view = "open", sort = "overdue", idle = [] } = {}) {
  const order = SORT_WORDS[sort] ?? SORT_WORDS.name;
  if (view === "everyone") return `Showing everyone, ${order}.`;
  const lead = `Showing people with something open, ${order}.`;
  if (!idle.length) return lead;
  return `${lead} ${namesText(idle)} ${idle.length === 1 ? "has" : "have"} nothing open (o shows everyone)`;
}
