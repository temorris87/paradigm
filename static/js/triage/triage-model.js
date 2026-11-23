// Inbox triage: for each note in the Inbox, the hub it most likely belongs in (the one its
// [[links]] and @mentions point to most), and what can be done with it. Pure.
//
//   suggestHub(ctx, noteId)     { hub, count } or null: ctx { tree, links, mentions, people }
//   triageOptions(suggested)    [{ action, label, detail? , danger? }] in the dialog's order;
//                               the keys are triage-keys.js's
import { hubOf, isArchived } from "../notes/hub-groups.js";
import { personForMention } from "../notes/mentions.js";
import { resolveLink, splitTarget } from "../notes/resolve.js";

export function suggestHub({ tree, links, mentions = [], people }, noteId) {
  const counts = new Map();
  const count = (hub) => {
    if (!hub || isArchived(tree, hub.id) || hub.id === noteId) return;
    counts.set(hub.id, (counts.get(hub.id) ?? 0) + 1);
  };
  for (const text of links?.targetsOf(noteId) ?? []) {
    const found = resolveLink(tree, noteId, splitTarget(text).link).note;
    if (found) count(hubOf(tree, found.id));
  }
  for (const mention of mentions.filter((each) => each.id === noteId)) {
    const person = personForMention(tree, mention.name);
    for (const link of person ? people?.get(person.id)?.hubs ?? [] : []) count(tree.get(link.hub_id));
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1]);
  return best ? { hub: tree.get(best[0]), count: best[1] } : null;
}

export function triageOptions(suggested) {
  return [
    ...(suggested ? [{ action: "underSuggested", label: `Under ${suggested.hub.title}`, detail: "the suggested hub" }] : []),
    { action: "resource", label: "Into Resources › a folder" },
    { action: "underNote", label: "Under another note…" },
    { action: "project", label: "Make it a project" },
    { action: "area", label: "Make it an area" },
    { action: "task", label: "Turn into a task and trash the note" },
    { action: "trash", label: "Trash", danger: true },
  ];
}
