// How tall each line is on screen. The engine asks its layout for the "unit" holding a line:
//   { start, end, rows, rendered }
// a run of lines that is drawn and scrolled as one piece, `rows` screen rows tall (it may be
// a fraction). This plain-text layout makes every line its own unit, wrapped at exactly
// view.width characters, the same rule the renderer uses. The live-preview layout
// (preview-layout.js) swaps in rendered Markdown blocks.

/** Rows one raw line takes. */
export function textRows(vim, line) {
  if (!vim.options.wrap) return 1;
  let length = vim.buf.lineLength(line);
  // An insert cursor after the last character needs a cell of its own.
  if (vim.cursor.line === line && vim.cursor.col >= length && vim.isInsertLike()) length += 1;
  return Math.max(1, Math.ceil(length / Math.max(1, vim.view.width)));
}

export function textUnit(vim, line) {
  return { start: line, end: line, rows: textRows(vim, line), rendered: false };
}

export const TEXT_LAYOUT = {
  unitAt: textUnit,
  anchorLine: () => null,
};
