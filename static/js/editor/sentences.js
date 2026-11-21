// Sentences for ( ) and the is / as text objects. A sentence ends at ".", "!" or "?",
// optionally followed by closing ) ] " ', then a space, a tab or the end of the line.
// Empty (or blank) lines are boundaries too.
import { comparePos, pos } from "./position.js";

const CLOSERS = new Set([")", "]", '"', "'"]);
const ENDERS = new Set([".", "!", "?"]);

/** Every position where a sentence starts, in order. */
export function sentenceStarts(buffer) {
  const starts = [];
  let expectStart = true;
  for (let line = 0; line < buffer.lineCount; line += 1) {
    const text = buffer.line(line);
    if (text.trim() === "") {
      starts.push(pos(line, 0));
      expectStart = true;
      continue;
    }
    for (let col = 0; col < text.length; col += 1) {
      const char = text[col];
      if (char === " " || char === "\t") continue;
      if (expectStart) {
        starts.push(pos(line, col));
        expectStart = false;
      }
      if (!ENDERS.has(char)) continue;
      let after = col + 1;
      while (after < text.length && CLOSERS.has(text[after])) after += 1;
      if (after === text.length || text[after] === " " || text[after] === "\t") {
        expectStart = true;
        col = after - 1;
      }
    }
  }
  return starts;
}

export function nextSentenceStart(buffer, from) {
  return sentenceStarts(buffer).find((start) => comparePos(start, from) > 0) ?? null;
}

export function prevSentenceStart(buffer, from) {
  const before = sentenceStarts(buffer).filter((start) => comparePos(start, from) < 0);
  return before.length ? before[before.length - 1] : null;
}

/** The start of the sentence holding `at`, and the start of the one after it (or null). */
export function sentenceAround(buffer, at) {
  const starts = sentenceStarts(buffer);
  let index = 0;
  while (index + 1 < starts.length && comparePos(starts[index + 1], at) <= 0) index += 1;
  return { start: starts[index] ?? pos(0, 0), next: starts[index + 1] ?? null };
}
