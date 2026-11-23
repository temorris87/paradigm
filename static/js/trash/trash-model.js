// The Trash read together with the notes tree: where each trashed note would go back to, and
// whether it can go back yet. Pure.
//
//   trashRows(trash, tree, { title }) -> [{ id, title, where, when, inside, blocked }]
//     trash: what trashApi.list() answered ({ entries, days }); title: the search box
import { dayOf } from "../hubs/hub-sections.js";
import { groupForKind, isRecordKind } from "../notes/hub-groups.js";
import { whereText } from "../notes/note-actions.js";
import { titleKey } from "../notes/titles.js";
import { dayText } from "../ui/dates.js";

export const NO_TRASH = Object.freeze({ entries: [], days: 7 });

export function trashRows(trash, tree, { title = "" } = {}) {
  const wanted = titleKey(title.trim());
  return trash.entries
    .filter((entry) => !wanted || titleKey(entry.title).includes(wanted))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      where: whereBack(entry, tree),
      when: `trashed ${dayText(dayOf(entry.deleted_at), { weekday: false })} · gone for good ${dayText(dayOf(entry.purge_at), { weekday: false })}`,
      inside: entry.inside === 0 ? "" : entry.inside === 1 ? "1 note under it" : `${entry.inside} notes under it`,
      blocked: blockedText(entry),
    }));
}

/** Where restoring puts it: "back in Projects › Acme", "back at the top". */
export function whereBack(entry, tree) {
  if (entry.parent_state === "live" && tree.has(entry.parent_id)) {
    return `back in ${[whereText(tree, entry.parent_id), tree.get(entry.parent_id).title].join(" › ")}`;
  }
  if (entry.parent_state === "trashed") {
    return isRecordKind(entry.kind) ? `was in ${entry.parent_title}` : `was in ${entry.parent_title} (in the Trash): back at the top`;
  }
  return `back in ${groupForKind(entry.kind).heading}`;
}

/** Why it can't come back yet, or null. */
export function blockedText(entry) {
  return isRecordKind(entry.kind) && entry.parent_state !== "live" ? `restore ${entry.parent_title ?? "its hub"} first` : null;
}
