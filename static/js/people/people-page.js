// The People page: the directory as 1:1 prep, drawn in place of the dashboard: Open items
// (those waiting on, owed or with something to raise; the default) or Everyone; filters
// (hub, role, organisation, name); for each, what they are on, what they owe me (late in
// orange), what I owe them, what to raise and when we next meet. A ListPage
// (static/js/pages/list-page.js) told what to show.
//
//   const page = peoplePage(sectionElement, { onOpen(id), onLeave(), onAdd(), today? });
//   page.show(ctx); page.focus();
//   personCounts(ctx, personId, today)   { waiting, late, owe, raise, next } (pure)
//   newPersonDialog(app, { first?, last?, open? })   New person: first and last name, then
//                            their note opens (open false: it doesn't; resolves to the note)
import { ListPage } from "../pages/list-page.js";
import { formDialog } from "../ui/dialog.js";
import { makePerson } from "./people-commands.js";
import { filterOptions, filterPeople, hubLinks } from "./people-model.js";
import { nextTogether, owedTo, toRaise } from "./one-on-one.js";
import { waitingOn } from "../tasks/tasks-model.js";
import { localDay } from "../meetings/meeting-days.js";
import { dayText } from "../ui/dates.js";

export function personCounts(ctx, personId, today) {
  const day = localDay(today);
  const waiting = ctx.tasks ? waitingOn(ctx.tree, ctx.tasks, personId) : [];
  return {
    waiting: waiting.length,
    late: waiting.filter((entry) => entry.task.follow_up && entry.task.follow_up < day).length,
    owe: ctx.tasks ? owedTo(ctx.tree, ctx.tasks, personId).length : 0,
    raise: toRaise(ctx, personId).length,
    next: ctx.meetings ? nextTogether(ctx.tree, ctx.meetings, personId, today) : null,
  };
}

const count = (n, late = 0) => (n ? `${n}${late ? ` · ${late} late` : ""}` : "");

export function newPersonDialog(app, { first = "", last = "", open = true } = {}) {
  return formDialog({
    title: "New person",
    fields: [
      { key: "first", label: "First name", value: first },
      { key: "last", label: "Last name", value: last, optional: true },
    ],
    submit: "Add to People",
    run: ({ first: given, last: family }) => makePerson(app, { first: given.trim(), last: family.trim() }, { strict: true, open }),
    fallbackFocus: () => app.focusNote(),
  });
}

export function peoplePage(section, { onOpen, onLeave, onAdd = () => {}, today = () => new Date() }) {
  const open = (ctx, note) => {
    const counts = personCounts(ctx, note.id, today());
    return counts.waiting || counts.owe || counts.raise;
  };
  return new ListPage(section, {
    name: "people",
    heading: "People",
    pills: {
      key: "view",
      choices: (ctx) => {
        const all = filterPeople(ctx.tree, ctx.people);
        return [["open", `Open items · ${all.filter((note) => open(ctx, note)).length}`], ["everyone", `Everyone · ${all.length}`]];
      },
    },
    filters: [
      { key: "hubId", label: "Hub" },
      { key: "role", label: "Role" },
      { key: "org", label: "Organisation" },
    ],
    search: { key: "name", label: "Name", placeholder: "any part of the name" },
    options: ({ tree, people }) => {
      const { hubs, roles, orgs } = filterOptions(tree, people);
      return {
        hubId: hubs.map((hub) => [String(hub.id), hub.title]),
        role: roles.map((role) => [role, role]),
        org: orgs.map((org) => [org, org]),
      };
    },
    rows: (ctx, { hubId, view, ...rest }) => filterPeople(ctx.tree, ctx.people, { ...rest, hubId: hubId === "" ? null : Number(hubId) })
      .filter((note) => view === "everyone" || open(ctx, note)),
    columns: ["Name", "Role · organisation", "On", "Waiting on them", "I owe", "To raise", "Next together"],
    cells: (note, ctx) => {
      const { tree, people } = ctx;
      const person = people.get(note.id);
      const links = hubLinks(tree, people, note.id).filter((link) => !link.archived);
      const counts = personCounts(ctx, note.id, today());
      return [
        ["people__title", note.title],
        ["people__work", [person.job, person.org].filter(Boolean).join(" · ")],
        ["people__hubs", links.map(({ hub, role }) => (role ? `${hub.title} (${role})` : hub.title)).join(", ")],
        [`people__count${counts.late ? " people__count--late" : ""}`, count(counts.waiting, counts.late)],
        ["people__count", count(counts.owe)],
        ["people__count", count(counts.raise)],
        ["people__next", counts.next ? `${dayText(counts.next.meeting.day, { today: localDay(today()) })}${counts.next.meeting.time ? ` ${counts.next.meeting.time}` : ""}` : ""],
      ];
    },
    empty: "No one matches",
    add: { label: "New person", run: onAdd },
    onOpen,
    onLeave,
  });
}
