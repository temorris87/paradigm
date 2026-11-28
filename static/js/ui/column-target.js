// h and l (and ← →) on a page of columns: where the cursor goes in the column beside. Pure:
// the page measures its rows and hands each one's column and top here.
//
//   columnTarget(rows, active, direction)  the index of the row in the nearest column to the
//                                          right (1) or left (-1) that has rows, nearest in
//                                          height to rows[active]; active itself past the
//                                          first or last column (no wrap)
//     rows: [{ column, top }]  column: a number, left to right (NaN: not a column h/l can
//                              reach); top: the row's top in px
//   laneColumns(rects, active)   each lane's column as seen from lanes[active], from where the
//                                lanes sit on screen: the lanes beside it (sharing some of its
//                                height) by their left edge, the rest NaN; stacked in one
//                                column (under 1400 px), none is beside it, so h/l stay put
//     rects: [{ top, bottom, left, right }]  each lane's box (getBoundingClientRect())
//   sideBySide(rects)            whether any two of the boxes sit side by side: a page with
//                                fixed columns checks it, so stacked they don't go up or down

export function columnTarget(rows, active, direction) {
  const from = rows[active];
  if (!from) return active;
  // The nearest column that way with any rows: an empty one in between is passed over.
  const beyond = rows.map((row) => row.column).filter((column) => (column - from.column) * direction > 0);
  if (!beyond.length) return active;
  const column = direction > 0 ? Math.min(...beyond) : Math.max(...beyond);
  let best = active;
  let distance = Infinity;
  rows.forEach((row, index) => {
    if (row.column !== column) return;
    // Strictly nearer: on a tie the row listed first wins.
    const away = Math.abs(row.top - from.top);
    if (away < distance) [best, distance] = [index, away];
  });
  return best;
}

// A person's page puts its cards in a row and Notes and Together in a second row under them,
// so lane order alone would take l from the right-most card down to Notes; stacked under
// 1400 px, it would take l from any lane down to the next.
export function laneColumns(rects, active) {
  const from = rects[active];
  if (!from) return rects.map(() => NaN);
  return rects.map((rect, index) => (index === active || besides(rect, from) ? rect.left : NaN));
}

export function sideBySide(rects) {
  return rects.some((a, i) => rects.some((b, j) => i < j && besides(a, b)));
}

// Sharing some height, one fully to the left of the other. A box with no height (a column
// drawn display: contents) shares none.
function besides(a, b) {
  return a.top < b.bottom && b.top < a.bottom && (a.right <= b.left || b.right <= a.left);
}
