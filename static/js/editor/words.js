// Word scanning for w b e ge and the word text objects. The buffer is walked one position
// at a time; each line ends in a virtual newline (col === length) that counts as blank.
// An empty line counts as a word of its own, as in Vim.
import { BLANK, charClass, pos } from "./position.js";

export const EMPTY = 3;

export function classAt(buffer, at, bigWord) {
  const text = buffer.line(at.line);
  if (text.length === 0) return EMPTY;
  if (at.col >= text.length) return BLANK;
  return charClass(text[at.col], bigWord);
}

export function nextPos(buffer, at) {
  if (at.col < buffer.lineLength(at.line)) return pos(at.line, at.col + 1);
  if (at.line < buffer.lastLine) return pos(at.line + 1, 0);
  return null;
}

export function prevPos(buffer, at) {
  if (at.col > 0) return pos(at.line, at.col - 1);
  if (at.line > 0) return pos(at.line - 1, buffer.lineLength(at.line - 1));
  return null;
}

/** Start of the next word (w / W). At the end of the buffer, the buffer's end position. */
export function nextWordStart(buffer, from, bigWord) {
  let at = from;
  const startClass = classAt(buffer, at, bigWord);
  if (startClass === EMPTY) {
    at = nextPos(buffer, at);
  } else if (startClass !== BLANK) {
    while (at && classAt(buffer, at, bigWord) === startClass) at = nextPos(buffer, at);
  }
  while (at && classAt(buffer, at, bigWord) === BLANK) at = nextPos(buffer, at);
  return at ?? buffer.endPos();
}

/** End of the word under or after the cursor, moving at least one character (e / E). */
export function nextWordEnd(buffer, from, bigWord) {
  let at = nextPos(buffer, from);
  while (at && isGap(classAt(buffer, at, bigWord))) at = nextPos(buffer, at);
  if (!at) return null;
  return runEnd(buffer, at, bigWord);
}

/** Last position of the run of same-class characters that starts at `at`. */
export function runEnd(buffer, at, bigWord) {
  const runClass = classAt(buffer, at, bigWord);
  let end = at;
  for (let next = nextPos(buffer, end); next && classAt(buffer, next, bigWord) === runClass;) {
    end = next;
    next = nextPos(buffer, end);
  }
  return end;
}

/** First position of the run of same-class characters that ends at `at`. */
export function runStart(buffer, at, bigWord) {
  const runClass = classAt(buffer, at, bigWord);
  if (runClass === EMPTY) return at;
  let start = at;
  for (let prev = prevPos(buffer, start); prev && classAt(buffer, prev, bigWord) === runClass;) {
    start = prev;
    prev = prevPos(buffer, start);
  }
  return start;
}

/** Start of the previous word (b / B). */
export function prevWordStart(buffer, from, bigWord) {
  let at = prevPos(buffer, from);
  while (at && classAt(buffer, at, bigWord) === BLANK) at = prevPos(buffer, at);
  if (!at) return pos(0, 0);
  return runStart(buffer, at, bigWord);
}

/** End of the previous word (ge / gE). */
export function prevWordEnd(buffer, from, bigWord) {
  let at = from;
  if (!isGap(classAt(buffer, at, bigWord))) at = runStart(buffer, at, bigWord);
  at = prevPos(buffer, at);
  while (at && classAt(buffer, at, bigWord) === BLANK) at = prevPos(buffer, at);
  return at ?? pos(0, 0);
}

function isGap(cls) {
  return cls === BLANK || cls === EMPTY;
}
