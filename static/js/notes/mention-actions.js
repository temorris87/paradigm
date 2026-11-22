// What @mentions do in the app: the people the editor offers after "@" (with "Add new
// person…" last), opening the person a clicked mention names, and rewriting the mentions of
// someone whose name changed.
//
//   mentionCompletions(app)               { "@": (query) => [item] } for editor.completions
//   openMention(app, name)                opens the person a name reaches
//   rewriteMentionsOf(app, personId, before, after)   asks, then rewrites @Before as @After
import { confirmDialog } from "../ui/dialog.js";
import { isArchived } from "./hub-groups.js";
import { mentionName, personForMention, rewriteMentions } from "./mentions.js";
import { allPeople, workText } from "../people/people-model.js";
import { newPersonDialog } from "../people/people-page.js";
import { titleKey } from "./titles.js";

const MAX_ITEMS = 8;

export function mentionCompletions(app) {
  return {
    "@": (query) => {
      const wanted = squash(query);
      const people = allPeople(app.tree).filter((person) => !isArchived(app.tree, person.id));
      const score = (person) => {
        const name = squash(person.title);
        const words = person.title.split(/\s+/).map(squash);
        if (name.startsWith(wanted)) return 0;
        if (words.some((word) => word.startsWith(wanted))) return 1;
        return name.includes(wanted) ? 2 : -1;
      };
      const matches = people.map((person) => ({ person, rank: score(person) })).filter(({ rank }) => rank >= 0)
        .sort((a, b) => a.rank - b.rank || titleKey(a.person.title).localeCompare(titleKey(b.person.title)))
        .slice(0, MAX_ITEMS);
      return [
        ...matches.map(({ person }) => ({ label: person.title, detail: workText(app.people.get(person.id)),
          insert: `@${mentionName(person)} ` })),
        { label: query ? `Add "${query}" to People…` : "Add new person…", run: (typed) => addPerson(app, typed) },
      ];
    },
  };
}

async function addPerson(app, typed) {
  const note = await newPersonDialog(app, { ...splitTyped(typed), open: false });
  return note && note !== true ? `@${mentionName(note)} ` : null;
}

/** "PriyaShah" -> { first: "Priya", last: "Shah" }; "Priya" -> { first: "Priya", last: "" } */
export function splitTyped(typed) {
  const match = /^(\p{Lu}?[\p{Ll}'-]+)(\p{Lu}.*)$/u.exec(String(typed ?? ""));
  return match ? { first: match[1], last: match[2] } : { first: String(typed ?? ""), last: "" };
}

export function openMention(app, name) {
  const person = personForMention(app.tree, name);
  if (!person) throw new Error(`E: no one in People is called "${name}"`);
  return app.open(person.id);
}

export async function rewriteMentionsOf(app, personId, before, after) {
  const oldNames = new Set([squash(before)]);
  const [oldFirst] = before.split(/\s+/);
  if (squash(after.split(/\s+/)[0]) !== squash(oldFirst)) oldNames.add(squash(oldFirst));
  // Mentions that reached them by the old name and reach no one now (or someone else).
  const stale = app.linkIndex.mentions.filter((mention) => oldNames.has(squash(mention.name))
    && personForMention(app.tree, mention.name)?.id !== personId);
  if (!stale.length) return;
  const notes = [...new Set(stale.map((mention) => mention.id))];
  const names = [...new Set(stale.map((mention) => mention.name))];
  const count = stale.length;
  await confirmDialog({
    title: `Update the mentions of ${after}?`,
    text: `${count} mention${count === 1 ? "" : "s"} in ${notes.length} note${notes.length === 1 ? "" : "s"} `
      + `say @${names.join(", @")}. Make them @${mentionName({ title: after })}?`,
    confirm: "Update mentions",
    run: () => rewriteIn(app, notes, names, mentionName({ title: after })),
    fallbackFocus: () => app.focusNote(),
  });
}

async function rewriteIn(app, ids, names, newName) {
  let changed = 0;
  for (const id of ids) {
    if (id === app.currentId) {
      changed += app.rewriteOpenText((text) => rewriteMentions(text, names, newName));
      continue;
    }
    const note = await app.api.get(id);
    const body = rewriteMentions(note.body, names, newName);
    const agenda = note.agenda === undefined ? null : rewriteMentions(note.agenda, names, newName);
    if (body.changed) await app.saveOther(note, body.text, agenda?.text);
    if (agenda?.changed) await app.saveOtherAgenda(note, agenda.text, body.text);
    changed += body.changed + (agenda?.changed ?? 0);
  }
  await app.refreshTree();
  app.editor.showMessage(`${changed} mention${changed === 1 ? "" : "s"} now say @${newName}`);
}

function squash(text) {
  return String(text ?? "").replace(/\s+/g, "").toLowerCase();
}
