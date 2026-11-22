// The People page: the directory with filters (hub, role, organisation, name), drawn in
// place of the note. A ListPage (static/js/pages/list-page.js) told what to show.
//
//   const page = peoplePage(sectionElement, { onOpen(id), onLeave(), onAdd() });
//   page.show({ tree, people }); page.focus();
//   newPersonDialog(app, { first?, last?, open? })   New person: first and last name, then
//                            their note opens (open false: it doesn't; resolves to the note)
import { ListPage } from "../pages/list-page.js";
import { formDialog } from "../ui/dialog.js";
import { makePerson } from "./people-commands.js";
import { filterOptions, filterPeople, hubLinks, workText } from "./people-model.js";

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

export function peoplePage(section, { onOpen, onLeave, onAdd = () => {} }) {
  return new ListPage(section, {
    name: "people",
    heading: "People",
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
    rows: ({ tree, people }, { hubId, ...rest }) =>
      filterPeople(tree, people, { ...rest, hubId: hubId === "" ? null : Number(hubId) }),
    cells: (note, { tree, people }) => [
      ["people__title", note.title],
      ["people__work", workText(people.get(note.id))],
      ["people__hubs", hubLinks(tree, people, note.id).filter((link) => !link.archived)
        .map(({ hub, role }) => (role ? `${hub.title} (${role})` : hub.title)).join(", ")],
    ],
    empty: "No one matches",
    add: { label: "New person", run: onAdd },
    onOpen,
    onLeave,
  });
}
