// THE key table of a folder's page (folder-page.js). Its key handling and any help listing
// read it; nothing else binds keys there. Text boxes keep their keys.
export const FOLDER_KEYS = [
  { keys: ["a"], action: "newNote", help: "New note… in this folder" },
  { keys: ["Escape"], action: "leave", help: "back to where you were" },
];

const BY_KEY = new Map(FOLDER_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

export function folderAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}
