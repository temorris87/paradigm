// Follow mode's labels (f in the main window, ui/follow-overlay.js draws them): which letters
// each target gets, and what the letters typed so far reach. Pure: no DOM.
//
//   hintLabels(count)          count labels: one home-row letter each for 9 or fewer, else two
//                              letters each from HINT_LETTERS (so no label starts another);
//                              never more than MAX_HINTS
//   readingOrder(boxes)        the indexes of [{ top, left }] top to bottom, then left to right
//   labelsFor(typed, labels)   the labels that still start with what was typed
//   followStep(typed, labels)  { state: "match", label } | { state: "more" } | { state: "none" }
//   nextTyped(typed, key)      what is typed after a key: a letter added (Shift ignored), or
//                              null for a key that is not one of the label letters
export const HOME_ROW = "asdfghjkl";
export const HINT_LETTERS = `${HOME_ROW}qwertyuiop`;
export const MAX_HINTS = HINT_LETTERS.length * HINT_LETTERS.length;

export function hintLabels(count) {
  const n = Math.max(0, Math.min(count, MAX_HINTS));
  if (n <= HOME_ROW.length) return [...HOME_ROW.slice(0, n)];
  const labels = [];
  for (const first of HINT_LETTERS) {
    for (const second of HINT_LETTERS) {
      if (labels.length === n) return labels;
      labels.push(first + second);
    }
  }
  return labels;
}

// Rows a pixel or two apart (borders, rounding) still read as one line.
const SAME_LINE_PX = 2;

export function readingOrder(boxes) {
  return boxes.map((box, index) => index).sort((a, b) => {
    const dy = boxes[a].top - boxes[b].top;
    if (Math.abs(dy) > SAME_LINE_PX) return dy;
    return boxes[a].left - boxes[b].left || a - b;
  });
}

export function labelsFor(typed, labels) {
  return labels.filter((label) => label.startsWith(typed));
}

export function followStep(typed, labels) {
  const left = labelsFor(typed, labels);
  if (!left.length) return { state: "none" };
  if (left.length === 1 && left[0] === typed) return { state: "match", label: typed };
  return { state: "more" };
}

export function nextTyped(typed, key) {
  const letter = String(key ?? "").toLowerCase();
  if (letter.length !== 1 || !HINT_LETTERS.includes(letter)) return null;
  return typed + letter;
}
