// The Settings page's sections and what it lists. Pure.
//
//   SETTINGS_SECTIONS                  [{ key, label }]: the index and the cards, in order
//   sectionOf(key)                     one of them, or null
//   litSection(cards, { picked, atEnd, slack })   the index entry to light: the last card whose
//                                      top has reached the top of the scroller (cards: [{ key,
//                                      top }], top in px from the scroller's top, in order). At the
//                                      foot, where the last cards can't reach the top, the entry
//                                      clicked (picked) stays lit while its card is in view
//   windowChoices(modes, current)      the Note window's radios: [{ key, label, help, checked }]
//   linkedFolderRows(folders, tree)    [{ id, hubId, hubTitle, name, path }]: every linked folder
//                                      by its hub's title, then its path
export const SETTINGS_SECTIONS = [
  { key: "window", label: "Note window" },
  { key: "hours", label: "Codes and hours" },
  { key: "holidays", label: "Holidays" },
  { key: "timeoff", label: "Time off and sick time" },
  { key: "folders", label: "Linked folders" },
  { key: "data", label: "Data folder" },
];

export const NO_FOLDERS = "No folders linked yet. Link one from a project's Files section.";

export function sectionOf(key) {
  return SETTINGS_SECTIONS.find((section) => section.key === key) ?? null;
}

export function litSection(cards, { picked = null, atEnd = false, slack = 2 } = {}) {
  if (!cards.length) return null;
  if (picked && atEnd) {
    const card = cards.find((each) => each.key === picked);
    if (card && card.top >= -slack) return picked;
  }
  let lit = cards[0].key;
  for (const card of cards) if (card.top <= slack) lit = card.key;
  return lit;
}

export function windowChoices(modes, current) {
  return modes.map(({ key, label, help }) => ({ key, label, help, checked: key === current }));
}

export function linkedFolderRows(folders, tree) {
  return folders.map((folder) => ({
    id: folder.id,
    hubId: folder.note_id,
    hubTitle: tree?.get(folder.note_id)?.title ?? "its hub",
    name: folder.name ?? "",
    path: folder.path ?? "",
  })).sort((a, b) => a.hubTitle.localeCompare(b.hubTitle) || a.path.localeCompare(b.path));
}
