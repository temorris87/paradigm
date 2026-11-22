// The People page: the directory with filters (hub, role, organisation, name), drawn in
// place of the note. A ListPage (static/js/pages/list-page.js) told what to show.
//
//   const page = peoplePage(sectionElement, { onOpen(id), onLeave() });
//   page.show({ tree, people }); page.focus();
import { ListPage } from "../pages/list-page.js";
import { filterOptions, filterPeople, hubLinks, workText } from "./people-model.js";

export function peoplePage(section, { onOpen, onLeave }) {
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
    empty: "No one matches (:newperson {name} adds someone)",
    onOpen,
    onLeave,
  });
}
