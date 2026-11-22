// THE key table for the notes tree (the sidebar). The tree's key handling and any help
// listing both read it; nothing else binds keys in the tree. Keys with Ctrl, Alt or Cmd held
// are left to the browser, and Tab moves the focus on, as everywhere.
export const TREE_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next note" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous note" },
  { keys: ["l", "ArrowRight"], action: "expand", help: "show the notes under it, or go to the first" },
  { keys: ["h", "ArrowLeft"], action: "collapse", help: "hide the notes under it, or go to its parent" },
  { keys: ["g", "Home"], action: "first", help: "first note" },
  { keys: ["G", "End"], action: "last", help: "last note" },
  { keys: ["Enter"], action: "open", help: "open the note in the editor" },
  { keys: ["a"], action: "add", help: "on a group: a new project, area, person...; on a note: a new note under it" },
  { keys: ["Escape"], action: "editor", help: "back to the editor" },
];

const BY_KEY = new Map(TREE_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means in the tree, or null. */
export function treeAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}
