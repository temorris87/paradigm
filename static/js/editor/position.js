// Positions are { line, col }, both counted from 0. col indexes UTF-16 code units.

export function pos(line, col) {
  return { line, col };
}

export function comparePos(a, b) {
  return a.line - b.line || a.col - b.col;
}

export function samePos(a, b) {
  return a.line === b.line && a.col === b.col;
}

export function minPos(a, b) {
  return comparePos(a, b) <= 0 ? a : b;
}

export function maxPos(a, b) {
  return comparePos(a, b) >= 0 ? a : b;
}

export function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/** Where text inserted at start ends. */
export function endAfter(start, text) {
  const parts = text.split("\n");
  if (parts.length === 1) return pos(start.line, start.col + text.length);
  return pos(start.line + parts.length - 1, parts[parts.length - 1].length);
}

export function leadingWhitespace(text) {
  return /^[ \t]*/.exec(text)[0];
}

/** Column of the first non-blank character; on a blank line, its last character (like Vim). */
export function firstNonBlankCol(text) {
  const match = /[^ \t]/.exec(text);
  return match ? match.index : lastCol(text);
}

/** The last column the normal-mode cursor may sit on. */
export function lastCol(text) {
  return Math.max(0, text.length - 1);
}

export function isBlankChar(char) {
  return char === " " || char === "\t";
}

// Character classes for word motions: 0 blank, 1 punctuation, 2 word character.
export const BLANK = 0;
export const PUNCT = 1;
export const WORD = 2;

export function charClass(char, bigWord = false) {
  if (char === undefined || char === " " || char === "\t" || char === "\n") return BLANK;
  if (bigWord) return WORD;
  return /[\p{L}\p{N}_]/u.test(char) ? WORD : PUNCT;
}
