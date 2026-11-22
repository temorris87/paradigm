// Which notes an export holds. Pure.
//
// The exported note, plus every note its [[wiki links]] reach that sits beside it, under it,
// or under a note beside it ("the same level or deeper"). Links are followed through the
// notes taken in, always measured from the exported note, so a bundled note never pulls in
// notes from another branch. Everything else stays out, and links to it become plain text.
import { wikiTargets } from "../notes/links.js";
import { resolveLink } from "../notes/resolve.js";

/** Whether note `id` may go into an export of `rootId`. */
export function inScope(tree, rootId, id) {
  if (!tree.has(id)) return false;
  if (id === rootId) return true;
  const parent = tree.parentId(rootId);
  // A top-level note's siblings are all the top-level notes, so everything is beside it or under.
  return parent === null || tree.ancestors(id).includes(parent);
}

/**
 * The notes of the export, the exported note first, then in the order first reached.
 * bodyOf(id) -> Promise of the note's text. Returns [{ id, title, body }].
 */
export async function collectNotes(tree, rootId, bodyOf) {
  const order = [rootId];
  const bodies = new Map();
  for (let index = 0; index < order.length; index += 1) {
    const id = order[index];
    const body = await bodyOf(id);
    bodies.set(id, body);
    for (const target of wikiTargets(body)) {
      const found = resolveLink(tree, id, target).note;
      if (found && !order.includes(found.id) && inScope(tree, rootId, found.id)) order.push(found.id);
    }
  }
  return order.map((id) => ({ id, title: tree.get(id)?.title ?? "", body: bodies.get(id) }));
}
