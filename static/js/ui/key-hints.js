// The key-hint bar at the foot of a view (css/key-hints.css): a key cap and a few words for
// each entry of the view's key table that carries hint:. It knows nothing about the views:
// the caller hands it the tables (layout/view-keys.js says which).
//
// In a key table, hint: is the words in the bar ("open"), label: the key cap when the first
// key alone would mislead ("j k" for next / previous, "↑↓"); without one, the cap is the
// first key, written as on a keyboard ("Space", "g t", "Esc").
//
//   keyName(key)              " " -> "Space", "gt" -> "g t", "S-Enter" -> "Shift-Enter"... (pure)
//   capOf(entry)              the key cap an entry shows in a bar (pure)
//   capKeys(entry)            the keys a cap stands for, as the table writes them (pure)
//   hintsOf(table, { scope, without, words }) -> [{ cap, words }] (pure)
//     scope: only that scope's entries (a table with scope: rows); without: actions left out;
//     words: { action: "words" } a view's own words for an entry's hint
//   keyGroups(table)          [{ name, rows: [{ keys: ["j", "↓"], help }] }] for a keys list,
//                             grouped by scope: as the table groups them (pure)
//   keyCap(text)              a <kbd class="key">
//   drawKeyHints(bar, hints)  fills the bar; nothing changes when the hints are the same
import { isSequence } from "./key-sequence.js";

const NAMES = new Map([
  [" ", "Space"],
  ["Escape", "Esc"],
  ["ArrowDown", "↓"],
  ["ArrowUp", "↑"],
  ["ArrowLeft", "←"],
  ["ArrowRight", "→"],
  ["Delete", "Del"],
]);

const GLYPHS = new Map([...NAMES].map(([key, name]) => [name, key]));

export function keyName(key) {
  if (NAMES.has(key)) return NAMES.get(key);
  if (key.startsWith("S-") && key.length > 2) return `Shift-${keyName(key.slice(2))}`;
  if (key.startsWith("C-") && key.length > 2) return `Ctrl-${keyName(key.slice(2))}`;
  if (isSequence(key)) return `${key[0]} ${key[1]}`;
  return key;
}

export function capOf(entry) {
  return entry.label ?? keyName(entry.keys[0]);
}

/** The keys a cap names, back in the table's own spelling: "j k" -> ["j", "k"], "↑↓" ->
 * ["ArrowUp", "ArrowDown"], "g t" -> ["gt"]. Lets a test check every hint is bound. */
export function capKeys(entry) {
  if (entry.label === undefined) return [entry.keys[0]];
  return entry.label.split(/[\s/]+/).filter(Boolean).flatMap((part) => {
    if (GLYPHS.has(part)) return [GLYPHS.get(part)];
    if (/^Shift-./.test(part)) return [`S-${GLYPHS.get(part.slice(6)) ?? part.slice(6)}`];
    if (/^Ctrl-./.test(part)) return [`C-${GLYPHS.get(part.slice(5)) ?? part.slice(5)}`];
    // Arrows run together ("↑↓"): one key each.
    if ([...part].every((char) => GLYPHS.has(char))) return [...part].map((char) => GLYPHS.get(char));
    return [part];
  });
}

export function hintsOf(table, { scope, without = [], words = {} } = {}) {
  return table.filter((entry) => entry.hint && (scope === undefined || entry.scope === scope) && !without.includes(entry.action))
    .map((entry) => ({ cap: capOf(entry), words: words[entry.action] ?? entry.hint }));
}

export function keyGroups(table) {
  const groups = [];
  for (const entry of table) {
    const name = entry.scope ?? "";
    let group = groups.find((each) => each.name === name);
    if (!group) {
      group = { name, rows: [] };
      groups.push(group);
    }
    group.rows.push({ keys: entry.keys.map(keyName), help: entry.help });
  }
  return groups;
}

export function keyCap(text) {
  const node = document.createElement("kbd");
  node.className = "key";
  node.textContent = text;
  return node;
}

export function drawKeyHints(bar, hints) {
  const signature = JSON.stringify(hints);
  if (bar.dataset.hints === signature) return;
  bar.dataset.hints = signature;
  bar.replaceChildren(...hints.map(({ cap, words }) => {
    const hint = document.createElement("span");
    hint.className = "key-hints__hint";
    const label = document.createElement("span");
    label.className = "key-hints__label";
    label.textContent = words;
    hint.append(keyCap(cap), label);
    return hint;
  }));
}
