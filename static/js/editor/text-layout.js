// How many screen rows a line takes: lines wrap at exactly view.width characters, the same
// rule the renderer uses, so what the engine thinks is on screen is what is on screen.

/** Rows one raw line takes. */
export function textRows(vim, line) {
  if (!vim.options.wrap) return 1;
  let length = vim.buf.lineLength(line);
  // An insert cursor after the last character needs a cell of its own.
  if (vim.cursor.line === line && vim.cursor.col >= length && vim.isInsertLike()) length += 1;
  return Math.max(1, Math.ceil(length / Math.max(1, vim.view.width)));
}
