// Search patterns are JavaScript regular expressions, matched one line at a time.
// Vim's word boundaries \< and \> are understood too (as \b), since * and # use them.
import { EditorError } from "./errors.js";
import { pos } from "./position.js";

export function translatePattern(pattern) {
  let out = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "\\" && index + 1 < pattern.length) {
      const next = pattern[index + 1];
      out += next === "<" || next === ">" ? "\\b" : char + next;
      index += 1;
    } else {
      out += char;
    }
  }
  return out;
}

/** A global RegExp for pattern. ignorecase/smartcase decide the "i" flag unless forced. */
export function compilePattern(pattern, options, forceCase = null) {
  let ignoreCase = options.ignorecase && !(options.smartcase && /[A-Z]/.test(pattern));
  if (forceCase !== null) ignoreCase = forceCase === "ignore";
  try {
    return new RegExp(translatePattern(pattern), ignoreCase ? "gi" : "g");
  } catch {
    throw new EditorError(`E383: Invalid search string: ${pattern}`);
  }
}

/** All matches on one line: [{ col, length }]. Empty matches are kept but never loop. */
export function lineMatches(regex, text) {
  const found = [];
  regex.lastIndex = 0;
  for (let match = regex.exec(text); match; match = regex.exec(text)) {
    found.push({ col: match.index, length: match[0].length });
    if (match[0].length === 0) regex.lastIndex += 1;
    if (regex.lastIndex > text.length) break;
  }
  return found;
}

/**
 * The next match after `from` (forward) or before it (backward), wrapping around the
 * buffer when wrapscan is on. Returns { pos, length, wrapped } or null.
 */
export function findMatch(buffer, regex, from, forward, wrapscan = true) {
  const count = buffer.lineCount;
  for (let step = 0; step <= count; step += 1) {
    const offset = forward ? step : -step;
    const raw = from.line + offset;
    const wrapped = raw < 0 || raw >= count;
    if (wrapped && !wrapscan) return null;
    const line = ((raw % count) + count) % count;
    const matches = lineMatches(regex, buffer.line(line));
    const match = pickMatch(matches, forward, step === 0 ? from.col : null, step === count);
    if (match) return { pos: pos(line, match.col), length: match.length, wrapped };
  }
  return null;
}

// On the starting line (col given) only matches strictly after / before col count. When the
// search has wrapped all the way back to that line (last), the rest of it counts.
function pickMatch(matches, forward, col, last) {
  if (forward) {
    if (col !== null) return matches.find((match) => match.col > col) ?? null;
    return matches[0] ?? null;
  }
  const candidates = col !== null && !last ? matches.filter((match) => match.col < col) : matches;
  return candidates[candidates.length - 1] ?? null;
}
