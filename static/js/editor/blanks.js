// Blanks: words in a text to be replaced, written ‹like this›. A host turns them on
// (editor.blankScope): then Tab in insert mode takes the next one, deleting it so what is typed
// replaces it. Pure: lines in, a blank's place out.
//
//   findBlank(lines, from, to) -> { line, start, end } | null   the first blank wholly between
//                                 two positions ({ line, col }; to exclusive)
//   nextBlank(lines, at, first, last) -> the first blank from `at` to the end of line `last`,
//                                 else, wrapping, the first from line `first` up to `at`

const BLANK = /‹[^‹›\n]*›/g;

export function findBlank(lines, from, to) {
  for (let line = from.line; line <= to.line && line < lines.length; line += 1) {
    const text = lines[line];
    BLANK.lastIndex = 0;
    for (let match = BLANK.exec(text); match; match = BLANK.exec(text)) {
      const start = match.index;
      const end = start + match[0].length;
      if (line === from.line && start < from.col) continue;
      if (line === to.line && end > to.col) break;
      return { line, start, end };
    }
  }
  return null;
}

export function nextBlank(lines, at, first, last) {
  const end = { line: last, col: lines[last]?.length ?? 0 };
  return findBlank(lines, at, end) ?? findBlank(lines, { line: first, col: 0 }, at);
}
