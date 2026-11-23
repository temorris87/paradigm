// @mentions: which ones a note's text holds (for the index the server keeps), which person a
// name reaches, and who mentions a person. Pure.
//
//   mentionsIn(text, field)          [{ field, line, name, context }]: each @mention the
//                                    renderer finds (never in code), its line (0-based) and
//                                    context: that line and the lines indented under it
//   mentionName(person)              "PriyaShah": what completion puts after the @
//   personForMention(tree, name)     the person a name reaches, or null: the full name without
//                                    spaces ("PriyaShah"), else a first name only one live
//                                    person has ("Priya"); case is ignored
//   mentionsOf(tree, mentions, personId)   [{ note, field, line, context, archived }]
//                                    who mentions a person, newest change first, archived last
//   rewriteMentions(text, oldNames, newName)   the text with @Old made @New (a rename)
import { renderMarkdown } from "../markdown/index.js";
import { MENTION, trimName } from "../markdown/mentions.js";
import { isArchived, isPerson } from "./hub-groups.js";

const MAX_CONTEXT = 2000;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function mentionsIn(text, field = "body") {
  const known = new Set();
  // The renderer finds every mention wherever it sits (never in code), as for wiki links.
  renderMarkdown(text, {
    resolveMention: (name) => {
      known.add(name.toLowerCase());
      return null;
    },
  });
  if (!known.size) return [];
  const lines = String(text).split("\n");
  const found = [];
  let fence = null;
  lines.forEach((line, index) => {
    const opener = FENCE.exec(line);
    if (fence) {
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      return;
    }
    if (opener) {
      fence = opener[1];
      return;
    }
    const seen = new Set();
    for (const name of namesOnLine(line)) {
      if (!known.has(name.toLowerCase()) || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      found.push({ field, line: index, name, context: contextAt(lines, index) });
    }
  });
  return found;
}

function namesOnLine(line) {
  const text = line.replace(/`[^`]*`/g, (code) => " ".repeat(code.length));
  const names = [];
  MENTION.lastIndex = 0;
  for (let match = MENTION.exec(text); match; match = MENTION.exec(text)) names.push(trimName(match[2]));
  return names;
}

/** The line and every line indented deeper under it (blank lines inside them too). */
export function contextAt(lines, index) {
  const indent = indentOf(lines[index]);
  let last = index;
  for (let at = index + 1; at < lines.length; at += 1) {
    if (!lines[at].trim()) continue;
    if (indentOf(lines[at]) <= indent) break;
    last = at;
  }
  return lines.slice(index, last + 1).join("\n").slice(0, MAX_CONTEXT);
}

function indentOf(line) {
  return /^[ \t]*/.exec(line)[0].replace(/\t/g, "    ").length;
}

// Spaces, apostrophes and hyphens are dropped: @LiamOConnor and @LiamO'Connor both reach
// "Liam O'Connor", and @AnnMarie reaches "Ann-Marie".
function squash(text) {
  return String(text ?? "").replace(/[\s'’-]+/g, "").toLowerCase();
}

export function mentionName(person) {
  return String(person.title ?? "").replace(/\s+/g, "");
}

export function personForMention(tree, name) {
  const wanted = squash(name);
  if (!wanted) return null;
  const people = tree.children(null).filter((note) => isPerson(tree, note.id));
  const full = people.filter((person) => squash(person.title) === wanted);
  if (full.length === 1) return full[0];
  const live = people.filter((person) => !isArchived(tree, person.id));
  const first = live.filter((person) => squash(person.title.split(/\s+/)[0]) === wanted);
  return first.length === 1 ? first[0] : null;
}

export function mentionsOf(tree, mentions, personId) {
  const found = [];
  for (const mention of mentions) {
    if (!tree.has(mention.id) || mention.id === personId) continue;
    if (personForMention(tree, mention.name)?.id !== personId) continue;
    found.push({ note: tree.get(mention.id), field: mention.field, line: mention.line, context: mention.context,
      archived: isArchived(tree, mention.id) });
  }
  return found.sort((a, b) => Number(a.archived) - Number(b.archived)
    || String(b.note.updated_at ?? "").localeCompare(String(a.note.updated_at ?? ""))
    || a.line - b.line);
}

export function rewriteMentions(text, oldNames, newName) {
  const wanted = new Set(oldNames.map((name) => name.toLowerCase()));
  let changed = 0;
  const lines = String(text).split("\n");
  let fence = null;
  const out = lines.map((line) => {
    const opener = FENCE.exec(line);
    if (fence) {
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      return line;
    }
    if (opener) {
      fence = opener[1];
      return line;
    }
    return line.replace(MENTION, (whole, before, raw) => {
      const name = trimName(raw);
      if (!wanted.has(name.toLowerCase())) return whole;
      changed += 1;
      return `${before}@${newName}${raw.slice(name.length)}`;
    });
  });
  return { text: out.join("\n"), changed };
}
