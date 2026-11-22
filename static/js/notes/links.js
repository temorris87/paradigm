// The wiki-link index read together with the notes tree: which notes link to a note. Pure.
//
// The server keeps each note's link texts as written (paradigm/db/links_repo.py); which note
// a text reaches is worked out here, with the rules that draw and follow links
// (resolve.js), so the backlinks always match where the links go today.
//
//   wikiTargets(body)                 the link texts in a body, in order ("A/B", no heading)
//   const links = new Links(list);    list: [{ id, targets }] from /api/links
//   links.set(id, targets)            a note was saved with these links
//   linksInto(tree, links, owner)     [{ note, reached: [notes], archived }]: the notes
//                                     outside owner linking to it or to a note under it
// Most recently changed first; those in archived hubs last.
import { renderMarkdown } from "../markdown/index.js";
import { isArchived } from "./hub-groups.js";
import { resolveLink } from "./resolve.js";

/** The note names in a body's [[wiki links]], in order (footnotes, tables and lists too). */
export function wikiTargets(body) {
  const targets = [];
  // The renderer already finds every link wherever it sits (never in code); it reports each
  // one to the resolver.
  renderMarkdown(body, {
    resolveWikiLink: (link) => {
      if (link.target) targets.push(link.target);
      return null;
    },
  });
  return targets;
}

export class Links {
  constructor(list = []) {
    this.byId = new Map(list.map(({ id, targets }) => [id, targets]));
  }

  set(id, targets) {
    this.byId.set(id, targets);
  }

  targetsOf(id) {
    return this.byId.get(id) ?? [];
  }

  ids() {
    return [...this.byId.keys()];
  }
}

export function linksInto(tree, links, owner) {
  if (!tree.has(owner.id)) return [];
  const inOwner = (id) => tree.path(id).some((note) => note.id === owner.id);
  const entries = [];
  for (const id of links.ids()) {
    if (!tree.has(id) || inOwner(id)) continue;
    const reached = new Map();
    for (const text of links.targetsOf(id)) {
      const note = resolveLink(tree, id, text).note;
      if (note && inOwner(note.id)) reached.set(note.id, note);
    }
    if (reached.size) entries.push({ note: tree.get(id), reached: [...reached.values()], archived: isArchived(tree, id) });
  }
  return entries.sort((a, b) => Number(a.archived) - Number(b.archived)
    || String(b.note.updated_at ?? "").localeCompare(String(a.note.updated_at ?? "")));
}
