// Bracket matching for % and the bracket text objects.
import { pos } from "./position.js";

export const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}", "<": ">" };
export const CLOSE_TO_OPEN = { ")": "(", "]": "[", "}": "{", ">": "<" };
const PERCENT_CHARS = "()[]{}";

/** For % : the first bracket at or after `at` on its line, and the bracket that matches it. */
export function percentMatch(buffer, at) {
  const text = buffer.line(at.line);
  for (let col = at.col; col < text.length; col += 1) {
    if (!PERCENT_CHARS.includes(text[col])) continue;
    return matchingBracket(buffer, pos(at.line, col));
  }
  return null;
}

/** The bracket matching the one at `at`, or null. */
export function matchingBracket(buffer, at) {
  const char = buffer.line(at.line)[at.col];
  if (OPEN_TO_CLOSE[char]) return scanForward(buffer, at, char, OPEN_TO_CLOSE[char]);
  if (CLOSE_TO_OPEN[char]) return scanBackward(buffer, at, CLOSE_TO_OPEN[char], char);
  return null;
}

/** The count-th pair of open/close around `at`. Returns { open, close } or null. */
export function enclosingPair(buffer, at, open, close, count = 1) {
  const char = buffer.line(at.line)[at.col];
  let openAt;
  if (char === open) openAt = at;
  else if (char === close) openAt = scanBackward(buffer, at, open, close);
  else openAt = findUnmatchedOpen(buffer, at, open, close);
  for (let level = 1; openAt && level < count; level += 1) {
    openAt = findUnmatchedOpen(buffer, openAt, open, close);
  }
  if (!openAt) return null;
  const closeAt = scanForward(buffer, openAt, open, close);
  return closeAt ? { open: openAt, close: closeAt } : null;
}

/** Vim 9.2: outside any pair, i( and friends use the next pair after the cursor. */
export function nextPair(buffer, at, open, close) {
  for (let line = at.line; line < buffer.lineCount; line += 1) {
    const text = buffer.line(line);
    const col = text.indexOf(open, line === at.line ? at.col + 1 : 0);
    if (col < 0) continue;
    const closeAt = scanForward(buffer, pos(line, col), open, close);
    return closeAt ? { open: pos(line, col), close: closeAt } : null;
  }
  return null;
}

// From the open bracket at `from`, find its close.
function scanForward(buffer, from, open, close) {
  let depth = 0;
  for (let line = from.line; line < buffer.lineCount; line += 1) {
    const text = buffer.line(line);
    for (let col = line === from.line ? from.col : 0; col < text.length; col += 1) {
      if (text[col] === open) depth += 1;
      else if (text[col] === close && --depth === 0) return pos(line, col);
    }
  }
  return null;
}

// From the close bracket at `from`, find its open.
function scanBackward(buffer, from, open, close) {
  let depth = 0;
  for (let line = from.line; line >= 0; line -= 1) {
    const text = buffer.line(line);
    for (let col = line === from.line ? from.col : text.length - 1; col >= 0; col -= 1) {
      if (text[col] === close) depth += 1;
      else if (text[col] === open && --depth === 0) return pos(line, col);
    }
  }
  return null;
}

// The nearest open bracket before `from` that is not closed before `from`.
function findUnmatchedOpen(buffer, from, open, close) {
  let depth = 0;
  for (let line = from.line; line >= 0; line -= 1) {
    const text = buffer.line(line);
    for (let col = line === from.line ? from.col - 1 : text.length - 1; col >= 0; col -= 1) {
      if (text[col] === close) depth += 1;
      else if (text[col] === open) {
        if (depth === 0) return pos(line, col);
        depth -= 1;
      }
    }
  }
  return null;
}
