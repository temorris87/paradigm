// The "$" rules for LaTeX maths, pure. Inline "$...$" follows pandoc so that prices stay
// text: the opening "$" has a non-space after it, the closing one a non-space before it and
// no digit after it ("costs $5 and $10" is not maths). "$$...$$" is display maths, inline or
// as a block of its own lines.

/**
 * The maths starting at text[pos] (a "$"): { tex, display, end } with `end` just past the
 * closing dollars, or null if this "$" starts no maths.
 */
export function readInlineMath(text, pos) {
  if (text[pos + 1] === "$") return readDisplay(text, pos + 2);
  const first = text[pos + 1];
  if (first === undefined || /\s/.test(first)) return null;
  for (let at = pos + 1; at < text.length; at += 1) {
    const char = text[at];
    if (char === "\\") {
      at += 1; // "\$" inside maths is TeX's dollar sign, not the end
    } else if (char === "$") {
      if (/\s/.test(text[at - 1]) || /[0-9]/.test(text[at + 1] ?? "")) return null;
      return { tex: text.slice(pos + 1, at), display: false, end: at + 1 };
    }
  }
  return null;
}

function readDisplay(text, start) {
  for (let at = start; at < text.length - 1; at += 1) {
    if (text[at] === "\\") {
      at += 1;
    } else if (text[at] === "$" && text[at + 1] === "$") {
      const tex = text.slice(start, at).trim();
      return tex ? { tex, display: true, end: at + 2 } : null;
    }
  }
  return null;
}

const OPENER = /^\$\$/;

/**
 * A "$$" block starting on this line (from its first non-space): null if the line starts no
 * block, else { closed } where closed means the line holds the whole block ("$$ x $$").
 * A line like "$$x$$ and more" is a paragraph with inline display maths instead.
 */
export function readMathOpener(rest) {
  if (!OPENER.test(rest)) return null;
  const after = rest.slice(2);
  const inner = after.indexOf("$$");
  if (inner === -1) return { closed: false };
  return endsMath(after) && inner === after.trimEnd().length - 2 ? { closed: true } : null;
}

/** Does this line end a "$$" block? */
export function endsMath(line) {
  return /(?:^|[^\\])\$\$[ \t]*$/.test(line);
}

/** The TeX of a block from its lines (the first one is what followed the opening "$$"). */
export function mathBlockTex(lines, closed) {
  const copy = lines.slice();
  if (closed && copy.length) copy[copy.length - 1] = copy[copy.length - 1].trimEnd().slice(0, -2);
  return copy.join("\n").trim();
}
