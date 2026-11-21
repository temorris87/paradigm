// Text objects (iw, a", i( ...). Each returns the text it covers as
// { start, end, linewise } with end exclusive, or null when there is no such object here.
import { enclosingPair, nextPair, OPEN_TO_CLOSE } from "./brackets.js";
import { charClass, firstNonBlankCol, isBlankChar, pos } from "./position.js";
import { sentenceAround } from "./sentences.js";

// iw / aw / iW / aW, on the cursor's line. Inner counts runs of blanks as words too.
function word(buf, cursor, count, around, bigWord) {
  const text = buf.line(cursor.line);
  if (text.length === 0) return null;
  const classOf = (col) => charClass(text[col], bigWord);
  const runEndFrom = (col) => {
    let end = col;
    while (end < text.length && classOf(end) === classOf(col)) end += 1;
    return end;
  };
  let start = cursor.col;
  while (start > 0 && classOf(start - 1) === classOf(cursor.col)) start -= 1;
  let end = cursor.col;
  for (let step = 0; step < count && end < text.length; step += 1) {
    if (!around) {
      end = runEndFrom(end);
      continue;
    }
    // a word plus the blanks after it; starting on blanks, the blanks plus the next word.
    if (isBlankChar(text[end])) {
      end = runEndFrom(end);
      if (end < text.length) end = runEndFrom(end);
    } else {
      end = runEndFrom(end);
      if (end < text.length && isBlankChar(text[end])) end = runEndFrom(end);
      else if (step === 0) {
        // No blanks after the last word: take the ones before it instead.
        while (start > 0 && isBlankChar(text[start - 1])) start -= 1;
      }
    }
  }
  return { start: pos(cursor.line, start), end: pos(cursor.line, end), linewise: false };
}

function sentence(buf, cursor, count, around) {
  const { start } = sentenceAround(buf, cursor);
  let next = start;
  for (let step = 0; step < count; step += 1) {
    const found = sentenceAround(buf, next).next;
    if (!found) {
      next = buf.endPos();
      break;
    }
    next = found;
  }
  const trimmed = trimBlanksBefore(buf, next, start);
  if (!around) return { start, end: trimmed, linewise: false };
  // "as" takes the blanks after the sentence, or the ones before it when there are none after.
  if (trimmed.line === next.line && trimmed.col === next.col) {
    let col = start.col;
    while (col > 0 && isBlankChar(buf.line(start.line)[col - 1])) col -= 1;
    return { start: pos(start.line, col), end: next, linewise: false };
  }
  return { start, end: next, linewise: false };
}

// Step back over blanks and line breaks that come before `at`, not past `floor`.
function trimBlanksBefore(buf, at, floor) {
  let { line, col } = at;
  for (;;) {
    if (line === floor.line && col <= floor.col) break;
    if (col > 0 && isBlankChar(buf.line(line)[col - 1])) col -= 1;
    else if (col === 0 && line > floor.line) {
      line -= 1;
      col = buf.lineLength(line);
    } else break;
  }
  return pos(line, col);
}

// ip / ap: a run of blank or non-blank lines; ap adds the blank lines after it
// (or before it, when there are none after).
function paragraph(buf, cursor, count, around) {
  const blank = (line) => buf.line(line).trim() === "";
  const runEndFrom = (line) => {
    let end = line;
    while (end + 1 <= buf.lastLine && blank(end + 1) === blank(line)) end += 1;
    return end;
  };
  let first = cursor.line;
  while (first > 0 && blank(first - 1) === blank(cursor.line)) first -= 1;
  let last = cursor.line - 1;
  for (let step = 0; step < count; step += 1) {
    if (last + 1 > buf.lastLine) return null;
    last = runEndFrom(last + 1);
    if (around) {
      const startedBlank = blank(last);
      if (last + 1 <= buf.lastLine) last = runEndFrom(last + 1);
      else if (step === 0 && !startedBlank) {
        while (first > 0 && blank(first - 1)) first -= 1;
      }
    }
  }
  return { start: pos(first, 0), end: pos(last, 0), linewise: true };
}

// i" a" and friends: quotes pair up from the start of the line. When the cursor is not
// inside a pair, the first pair after it is used.
function quote(buf, cursor, count, around, mark) {
  const text = buf.line(cursor.line);
  const quotes = [];
  for (let col = 0; col < text.length; col += 1) {
    if (text[col] === "\\") col += 1;
    else if (text[col] === mark) quotes.push(col);
  }
  let pair = null;
  for (let index = 0; index + 1 < quotes.length; index += 2) {
    if (quotes[index + 1] >= cursor.col) {
      pair = [quotes[index], quotes[index + 1]];
      break;
    }
  }
  if (!pair) return null;
  let [open, close] = pair;
  // With a count, i" takes the quotes too (but no blanks), as in Vim.
  if (!around && count > 1) return { start: pos(cursor.line, open), end: pos(cursor.line, close + 1), linewise: false };
  if (!around) return { start: pos(cursor.line, open + 1), end: pos(cursor.line, close), linewise: false };
  close += 1;
  if (close < text.length && isBlankChar(text[close])) {
    while (close < text.length && isBlankChar(text[close])) close += 1;
  } else {
    while (open > 0 && isBlankChar(text[open - 1])) open -= 1;
  }
  return { start: pos(cursor.line, open), end: pos(cursor.line, close), linewise: false };
}

function bracket(buf, cursor, count, around, openChar) {
  const closeChar = OPEN_TO_CLOSE[openChar];
  const pair = enclosingPair(buf, cursor, openChar, closeChar, count) ?? nextPair(buf, cursor, openChar, closeChar);
  if (!pair) return null;
  const { open, close } = pair;
  if (around) return { start: open, end: pos(close.line, close.col + 1), linewise: false };
  const openLine = buf.line(open.line);
  const closeLine = buf.line(close.line);
  // A block written as "{" at a line's end ... "}" at the next one's start: the lines between.
  if (open.col === openLine.length - 1 && close.col === firstNonBlankCol(closeLine) && close.line > open.line) {
    if (close.line === open.line + 1) return null;
    return { start: pos(open.line + 1, 0), end: pos(close.line - 1, 0), linewise: true };
  }
  return { start: pos(open.line, open.col + 1), end: close, linewise: false };
}

/** Text objects by name. Args: (buf, cursor, count, around). */
export const TEXT_OBJECTS = {
  word: (buf, cursor, count, around) => word(buf, cursor, count, around, false),
  bigWord: (buf, cursor, count, around) => word(buf, cursor, count, around, true),
  sentence,
  paragraph,
  doubleQuote: (buf, cursor, count, around) => quote(buf, cursor, count, around, '"'),
  singleQuote: (buf, cursor, count, around) => quote(buf, cursor, count, around, "'"),
  backQuote: (buf, cursor, count, around) => quote(buf, cursor, count, around, "`"),
  paren: (buf, cursor, count, around) => bracket(buf, cursor, count, around, "("),
  square: (buf, cursor, count, around) => bracket(buf, cursor, count, around, "["),
  brace: (buf, cursor, count, around) => bracket(buf, cursor, count, around, "{"),
  angle: (buf, cursor, count, around) => bracket(buf, cursor, count, around, "<"),
};

