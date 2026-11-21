// Motions. Each takes a context and returns where the cursor goes, or null when it cannot move
// (Vim beeps). The result says how an operator treats the text it covers:
//   { pos, linewise?, inclusive?, jump?, want? }
// - linewise: whole lines; inclusive: the character at pos is included (else it is not);
// - jump: sets the ' mark first; want: "keep" keeps the remembered column (j / k),
//   Infinity sticks to the end of lines ($).
// Context: { vim, buf, cursor, count, hasCount, arg, operator } where operator is the
// pending operator's name, or null.
import { percentMatch } from "./brackets.js";
import { EditorError } from "./errors.js";
import { clamp, firstNonBlankCol, lastCol, pos, BLANK } from "./position.js";
import { compilePattern, findMatch } from "./search.js";
import { nextSentenceStart, prevSentenceStart } from "./sentences.js";
import { cursorLineRange } from "./view.js";
import {
  classAt, EMPTY, nextWordEnd, nextWordStart, prevWordEnd, prevWordStart, runEnd,
} from "./words.js";

function lineTarget(ctx, line) {
  const text = ctx.buf.line(line);
  return { pos: pos(line, firstNonBlankCol(text)), linewise: true };
}

function verticalTarget(ctx, line) {
  return { pos: pos(line, ctx.vim.wantedCol(line)), linewise: true, want: "keep" };
}

const left = (ctx) => {
  if (ctx.cursor.col === 0) return null;
  return { pos: pos(ctx.cursor.line, Math.max(0, ctx.cursor.col - ctx.count)) };
};

const right = (ctx) => {
  const length = ctx.buf.lineLength(ctx.cursor.line);
  // With an operator, "l" may cover the last character, so it may reach the line's end.
  const limit = ctx.operator ? length : lastCol(ctx.buf.line(ctx.cursor.line));
  if (ctx.cursor.col >= limit) return null;
  return { pos: pos(ctx.cursor.line, Math.min(limit, ctx.cursor.col + ctx.count)) };
};

// <Space> and <BS> go on to the next / previous line, as with Vim's default 'whichwrap'.
function wrappingStep(ctx, direction) {
  let { line, col } = ctx.cursor;
  for (let step = 0; step < ctx.count; step += 1) {
    const length = ctx.buf.lineLength(line);
    if (direction > 0 && col + 1 < length) col += 1;
    else if (direction > 0 && line < ctx.buf.lastLine) [line, col] = [line + 1, 0];
    else if (direction < 0 && col > 0) col -= 1;
    else if (direction < 0 && line > 0) [line, col] = [line - 1, lastCol(ctx.buf.line(line - 1))];
    else if (step === 0) return null;
    else break;
  }
  return { pos: pos(line, col) };
}

const down = (ctx) => {
  if (ctx.cursor.line >= ctx.buf.lastLine) return null;
  return verticalTarget(ctx, Math.min(ctx.buf.lastLine, ctx.cursor.line + ctx.count));
};

const up = (ctx) => {
  if (ctx.cursor.line === 0) return null;
  return verticalTarget(ctx, Math.max(0, ctx.cursor.line - ctx.count));
};

// gj / gk: move by screen rows inside wrapped lines.
function screenStep(ctx, direction) {
  const width = Math.max(1, ctx.vim.view.width);
  if (!ctx.vim.options.wrap) return direction > 0 ? down(ctx) : up(ctx);
  let { line, col } = ctx.cursor;
  for (let step = 0; step < ctx.count; step += 1) {
    const rows = Math.max(1, Math.ceil(ctx.buf.lineLength(line) / width));
    const row = Math.floor(col / width);
    if (direction > 0 && row + 1 < rows) col += width;
    else if (direction < 0 && row > 0) col -= width;
    else if (direction > 0 && line < ctx.buf.lastLine) [line, col] = [line + 1, col % width];
    else if (direction < 0 && line > 0) {
      line -= 1;
      const prevRows = Math.max(1, Math.ceil(ctx.buf.lineLength(line) / width));
      col = (prevRows - 1) * width + (col % width);
    } else if (step === 0) return null;
    else break;
    col = Math.min(col, lastCol(ctx.buf.line(line)));
  }
  return { pos: pos(line, col) };
}

const lineStart = (ctx) => ({ pos: pos(ctx.cursor.line, 0) });

const firstNonBlank = (ctx) => ({ pos: pos(ctx.cursor.line, firstNonBlankCol(ctx.buf.line(ctx.cursor.line))) });

const lineEnd = (ctx) => {
  const line = Math.min(ctx.buf.lastLine, ctx.cursor.line + ctx.count - 1);
  const length = ctx.buf.lineLength(line);
  return { pos: pos(line, Math.max(0, length - 1)), inclusive: length > 0, want: Infinity };
};

const lastNonBlank = (ctx) => {
  const line = Math.min(ctx.buf.lastLine, ctx.cursor.line + ctx.count - 1);
  const text = ctx.buf.line(line);
  const trimmed = text.replace(/[ \t]+$/, "");
  return { pos: pos(line, Math.max(0, trimmed.length - 1)), inclusive: trimmed.length > 0 };
};

const column = (ctx) => ({ pos: pos(ctx.cursor.line, Math.min(ctx.count - 1, lastCol(ctx.buf.line(ctx.cursor.line)))) });

const nextLineStart = (ctx) => {
  if (ctx.cursor.line + ctx.count > ctx.buf.lastLine) return null;
  return lineTarget(ctx, ctx.cursor.line + ctx.count);
};

const prevLineStart = (ctx) => {
  if (ctx.cursor.line - ctx.count < 0) return null;
  return lineTarget(ctx, ctx.cursor.line - ctx.count);
};

const currentLineStart = (ctx) => lineTarget(ctx, Math.min(ctx.buf.lastLine, ctx.cursor.line + ctx.count - 1));

function wordForward(ctx, bigWord) {
  const { buf } = ctx;
  const startClass = classAt(buf, ctx.cursor, bigWord);
  // "cw" on a word changes to its end, without the blanks after it (Vim's special case).
  if (ctx.operator === "change" && startClass !== BLANK && startClass !== EMPTY) {
    let end = runEnd(buf, ctx.cursor, bigWord);
    for (let step = 1; step < ctx.count && end; step += 1) end = nextWordEnd(buf, end, bigWord) ?? end;
    return { pos: end, inclusive: true };
  }
  let at = ctx.cursor;
  let stepStart = at;
  for (let step = 0; step < ctx.count; step += 1) {
    stepStart = at;
    at = nextWordStart(buf, at, bigWord);
  }
  if (ctx.operator) {
    // With an operator, a word at the end of a line stops at that line's end.
    if (at.line > stepStart.line && !(at.col === 0 && buf.lineLength(stepStart.line) === 0)) {
      return { pos: pos(stepStart.line, buf.lineLength(stepStart.line)) };
    }
    return { pos: at };
  }
  const clamped = pos(at.line, Math.min(at.col, lastCol(buf.line(at.line))));
  if (clamped.line === ctx.cursor.line && clamped.col === ctx.cursor.col) return null;
  return { pos: clamped };
}

function repeatScan(ctx, scan) {
  let at = ctx.cursor;
  for (let step = 0; step < ctx.count; step += 1) {
    const next = scan(at);
    if (!next) {
      if (step === 0) return null;
      break;
    }
    at = next;
  }
  if (at.line === ctx.cursor.line && at.col === ctx.cursor.col) return null;
  return at;
}

function wordEnd(ctx, bigWord) {
  const at = repeatScan(ctx, (from) => nextWordEnd(ctx.buf, from, bigWord));
  return at && { pos: at, inclusive: true };
}

function wordBackward(ctx, bigWord) {
  const at = repeatScan(ctx, (from) => prevWordStart(ctx.buf, from, bigWord));
  return at && { pos: at };
}

function wordEndBackward(ctx, bigWord) {
  const at = repeatScan(ctx, (from) => prevWordEnd(ctx.buf, from, bigWord));
  return at && { pos: at, inclusive: true };
}

const firstLine = (ctx) => ({ ...lineTarget(ctx, clamp(ctx.hasCount ? ctx.count - 1 : 0, 0, ctx.buf.lastLine)), jump: true });

const lastLine = (ctx) => ({ ...lineTarget(ctx, clamp(ctx.hasCount ? ctx.count - 1 : ctx.buf.lastLine, 0, ctx.buf.lastLine)), jump: true });

// f F t T: find a character on the current line.
export function findChar(ctx, { char, forward, till }, repeating = false) {
  const text = ctx.buf.line(ctx.cursor.line);
  let col = ctx.cursor.col;
  for (let found = 0; found < ctx.count; found += 1) {
    // Repeating "t" with ; must not get stuck just before the same character.
    let from = col + (forward ? 1 : -1);
    if (till && repeating && found === 0 && text[from] === char) from += forward ? 1 : -1;
    col = forward ? text.indexOf(char, from) : (from < 0 ? -1 : text.lastIndexOf(char, from));
    if (col < 0) return null;
  }
  if (till) col += forward ? -1 : 1;
  return { pos: pos(ctx.cursor.line, col), inclusive: forward };
}

function findMotion(forward, till) {
  return (ctx) => {
    if (!ctx.arg || [...ctx.arg].length !== 1) return null;
    const find = { char: ctx.arg, forward, till };
    ctx.vim.lastFind = find;
    return findChar(ctx, find);
  };
}

function repeatFind(reverse) {
  return (ctx) => {
    const last = ctx.vim.lastFind;
    if (!last) return null;
    return findChar(ctx, { ...last, forward: reverse ? !last.forward : last.forward }, true);
  };
}

const matchPair = (ctx) => {
  if (ctx.hasCount) {
    if (ctx.count > 100) return null;
    const line = Math.ceil((ctx.count * ctx.buf.lineCount) / 100) - 1;
    return { ...lineTarget(ctx, clamp(line, 0, ctx.buf.lastLine)), jump: true };
  }
  const at = percentMatch(ctx.buf, ctx.cursor);
  return at && { pos: at, inclusive: true, jump: true };
};

// } and { stop at empty lines (lines with only blanks do not count, as in Vim).
function paragraphForward(ctx) {
  const { buf } = ctx;
  let line = ctx.cursor.line;
  for (let step = 0; step < ctx.count && line < buf.lastLine; step += 1) {
    while (line < buf.lastLine && buf.lineLength(line) === 0) line += 1;
    while (line < buf.lastLine && buf.lineLength(line) !== 0) line += 1;
  }
  const length = buf.lineLength(line);
  // Past the last paragraph: the end of the buffer (all of it, for an operator).
  const col = length === 0 ? 0 : ctx.operator ? length : length - 1;
  if (line === ctx.cursor.line && col === ctx.cursor.col) return null;
  return { pos: pos(line, col), jump: true };
}

function paragraphBackward(ctx) {
  const { buf } = ctx;
  let line = ctx.cursor.line;
  for (let step = 0; step < ctx.count && line > 0; step += 1) {
    while (line > 0 && buf.lineLength(line) === 0) line -= 1;
    while (line > 0 && buf.lineLength(line) !== 0) line -= 1;
  }
  if (line === ctx.cursor.line && ctx.cursor.col === 0) return null;
  return { pos: pos(line, 0), jump: true };
}

function sentence(forward) {
  return (ctx) => {
    const scan = forward
      ? (from) => nextSentenceStart(ctx.buf, from) ?? lastPosition(ctx.buf, from)
      : (from) => prevSentenceStart(ctx.buf, from);
    const at = repeatScan(ctx, scan);
    return at && { pos: at, jump: true };
  };
}

function lastPosition(buf, from) {
  const end = pos(buf.lastLine, lastCol(buf.line(buf.lastLine)));
  return end.line === from.line && end.col === from.col ? null : end;
}

// H M L stay inside the scrolloff margin, so they never scroll the screen.
const screenTop = (ctx) => {
  const { top, low, high } = cursorLineRange(ctx.vim);
  return { ...lineTarget(ctx, clamp(top + ctx.count - 1, low, high)), jump: true };
};

const screenBottom = (ctx) => {
  const { bottom, low, high } = cursorLineRange(ctx.vim);
  return { ...lineTarget(ctx, clamp(bottom - ctx.count + 1, low, high)), jump: true };
};

const screenMiddle = (ctx) => {
  const { top, bottom } = cursorLineRange(ctx.vim);
  return { ...lineTarget(ctx, top + Math.floor((bottom - top) / 2)), jump: true };
};

/** Run a search from the cursor, count times. Used by n N * # and by / ? on <CR>. */
export function searchMotion(ctx, pattern, forward) {
  const regex = compilePattern(pattern, ctx.vim.options);
  let at = ctx.cursor;
  let wrapped = false;
  for (let step = 0; step < ctx.count; step += 1) {
    const match = findMatch(ctx.buf, regex, at, forward, ctx.vim.options.wrapscan);
    if (!match) {
      const where = ctx.vim.options.wrapscan ? "" : forward ? " (search hit BOTTOM)" : " (search hit TOP)";
      throw new EditorError(`E486: Pattern not found: ${pattern}${where}`);
    }
    wrapped = wrapped || match.wrapped;
    at = match.pos;
  }
  if (wrapped) ctx.vim.say(forward ? "search hit BOTTOM, continuing at TOP" : "search hit TOP, continuing at BOTTOM");
  return { pos: at, jump: true };
}

function searchAgain(reverse) {
  return (ctx) => {
    const { pattern, forward } = ctx.vim.search;
    if (!pattern) throw new EditorError("E35: No previous regular expression");
    ctx.vim.search.highlight = true;
    ctx.vim.say(`${forward !== reverse ? "/" : "?"}${pattern}`);
    return searchMotion(ctx, pattern, forward !== reverse);
  };
}

function searchWord(forward) {
  return (ctx) => {
    const text = ctx.buf.line(ctx.cursor.line);
    const word = keywordAtOrAfter(text, ctx.cursor.col);
    if (!word) throw new EditorError("E348: No string under cursor");
    const escaped = word.text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const pattern = /^[\p{L}\p{N}_]/u.test(word.text) ? `\\<${escaped}\\>` : escaped;
    ctx.vim.setSearch(pattern, forward);
    // Start from the word's own start so a backward search skips the word itself.
    return searchMotion({ ...ctx, cursor: pos(ctx.cursor.line, word.start) }, pattern, forward);
  };
}

function keywordAtOrAfter(text, col) {
  const regex = /[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu;
  for (let match = regex.exec(text); match; match = regex.exec(text)) {
    const end = match.index + match[0].length;
    if (end > col) return { text: match[0], start: match.index };
  }
  return null;
}

function markMotion(linewise) {
  return (ctx) => {
    const name = ctx.arg === "`" ? "'" : ctx.arg;
    const mark = ctx.vim.marks.get(name);
    if (!mark) throw new EditorError("E20: Mark not set");
    const line = clamp(mark.line, 0, ctx.buf.lastLine);
    if (linewise) return { ...lineTarget(ctx, line), jump: true };
    return { pos: pos(line, Math.min(mark.col, ctx.buf.lineLength(line))), jump: true };
  };
}

/** Motion functions by name; keys.js says which keys reach them. */
export const MOTIONS = {
  left,
  right,
  backspaceLeft: (ctx) => wrappingStep(ctx, -1),
  spaceRight: (ctx) => wrappingStep(ctx, 1),
  down,
  up,
  screenDown: (ctx) => screenStep(ctx, 1),
  screenUp: (ctx) => screenStep(ctx, -1),
  lineStart,
  firstNonBlank,
  lineEnd,
  lastNonBlank,
  column,
  nextLineStart,
  prevLineStart,
  currentLineStart,
  wordForward: (ctx) => wordForward(ctx, false),
  bigWordForward: (ctx) => wordForward(ctx, true),
  wordBackward: (ctx) => wordBackward(ctx, false),
  bigWordBackward: (ctx) => wordBackward(ctx, true),
  wordEnd: (ctx) => wordEnd(ctx, false),
  bigWordEnd: (ctx) => wordEnd(ctx, true),
  wordEndBackward: (ctx) => wordEndBackward(ctx, false),
  bigWordEndBackward: (ctx) => wordEndBackward(ctx, true),
  firstLine,
  lastLine,
  findForward: findMotion(true, false),
  findBackward: findMotion(false, false),
  tillForward: findMotion(true, true),
  tillBackward: findMotion(false, true),
  repeatFind: repeatFind(false),
  repeatFindReverse: repeatFind(true),
  matchPair,
  paragraphForward,
  paragraphBackward,
  sentenceForward: sentence(true),
  sentenceBackward: sentence(false),
  screenTop,
  screenMiddle,
  screenBottom,
  searchNext: searchAgain(false),
  searchPrev: searchAgain(true),
  searchWordForward: searchWord(true),
  searchWordBackward: searchWord(false),
  markLine: markMotion(true),
  markExact: markMotion(false),
};

