// Follow mode's labels (f in the main window, ui/follow-overlay.js draws them): which letters
// each target gets, and what the letters typed so far reach. Pure: no DOM.
//
//   hintLabels(count)          count labels: one home-row letter each for 9 or fewer, else two
//                              letters each from HINT_LETTERS (so no label starts another), their
//                              first letters spread over min(19, count) letters in runs, so the
//                              first letter typed leaves at most ceil(count / 19); never more
//                              than MAX_HINTS
//   readingOrder(boxes)        the indexes of [{ top, left }] in lines top to bottom (a line: the
//                              tops within 2 px of its first), each left to right
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
  // As many first letters as there are labels (up to 19), each a run of labels in reading order,
  // the runs as even as can be: the first letter typed then hides all but its run.
  const firsts = Math.min(HINT_LETTERS.length, n);
  const base = Math.floor(n / firsts);
  const extra = n % firsts;
  const labels = [];
  for (let at = 0; at < firsts; at += 1) {
    const size = base + (at < extra ? 1 : 0);
    for (let second = 0; second < size; second += 1) labels.push(HINT_LETTERS[at] + HINT_LETTERS[second]);
  }
  return labels;
}

// Rows a pixel or two apart (borders, rounding) still read as one line. Measured from the line's
// first top, not pairwise: a pairwise tolerance isn't transitive, so a sort by it is inconsistent.
const SAME_LINE_PX = 2;

export function readingOrder(boxes) {
  const byTop = boxes.map((box, index) => index).sort((a, b) => boxes[a].top - boxes[b].top || a - b);
  const lines = [];
  for (const index of byTop) {
    const line = lines.at(-1);
    if (line && boxes[index].top - boxes[line[0]].top <= SAME_LINE_PX) line.push(index);
    else lines.push([index]);
  }
  return lines.flatMap((line) => line.sort((a, b) => boxes[a].left - boxes[b].left || a - b));
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
