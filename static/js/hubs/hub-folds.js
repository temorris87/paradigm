// What this browser remembers about the sections on hub pages: which ones are folded, per
// kind of page ("project:notes"). A section folded by default (a person's Archived) is
// remembered both ways. load/save use localStorage and quietly forget when it is off.
const FOLDS_KEY = "paradigm.hub.folds";

/** { "kind:section": true (folded) | false (open) } */
export function loadFolds() {
  const folds = read(FOLDS_KEY);
  return folds && typeof folds === "object" && !Array.isArray(folds) ? folds : {};
}

export function saveFolds(folds) {
  write(FOLDS_KEY, folds);
}

export function foldKey(kind, section) {
  return `${kind}:${section.key}`;
}

export function isFolded(folds, kind, section) {
  return folds[foldKey(kind, section)] ?? Boolean(section.folded);
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or off: the page just forgets.
  }
}
