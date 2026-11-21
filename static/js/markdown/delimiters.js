// Emphasis by the CommonMark delimiter rules: runs of * and _ (em, strong), and ~~ (strike)
// and == (highlight), which only count as exactly two. A run's neighbours decide whether it
// can open, close, or both; then processEmphasis() pairs closers with the nearest opener.

const WHITESPACE = /\s/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;

/** Look at the run of `char` at `pos`: its length and whether it can open or close. */
export function scanDelimiterRun(text, pos) {
  const char = text[pos];
  let end = pos;
  while (text[end] === char) end += 1;
  const count = end - pos;
  const before = pos === 0 ? "\n" : text[pos - 1];
  const after = end >= text.length ? "\n" : text[end];
  const beforeSpace = WHITESPACE.test(before);
  const afterSpace = WHITESPACE.test(after);
  const beforePunct = PUNCTUATION.test(before);
  const afterPunct = PUNCTUATION.test(after);
  const leftFlanking = !afterSpace && (!afterPunct || beforeSpace || beforePunct);
  const rightFlanking = !beforeSpace && (!beforePunct || afterSpace || afterPunct);
  if (char === "_") {
    // No emphasis inside words with underscores: snake_case_name stays as it is.
    return {
      count,
      canOpen: leftFlanking && (!rightFlanking || beforePunct),
      canClose: rightFlanking && (!leftFlanking || afterPunct),
    };
  }
  return { count, canOpen: leftFlanking, canClose: rightFlanking };
}

const TAGS = { "~": "del", "=": "mark" };

// Emphasis, links and images nest at most this deep; past it their markers stay text.
// Deeper trees would overflow the stack when rendered.
export const MAX_INLINE_NESTING = 32;

/** How deeply the given nodes nest (a wrapper node records its own depth). */
export function nestingDepth(nodes) {
  return nodes.reduce((deepest, node) => Math.max(deepest, node.depth ?? 0), 0);
}

/**
 * Pair up the delimiters above `bottom` on the parser's stack, wrapping the nodes between
 * each pair in an em/strong/del/mark node. `parser.nodes` is the flat node list and
 * `parser.delimiters` the top of a doubly linked delimiter stack.
 */
export function processEmphasis(parser, bottom) {
  const openersBottom = new Map();
  let closer = parser.delimiters;
  while (closer && closer.previous !== bottom) closer = closer.previous;
  while (closer) {
    if (!closer.canClose) {
      closer = closer.next;
      continue;
    }
    const emphasis = closer.char === "*" || closer.char === "_";
    const key = emphasis ? `${closer.char}${closer.canOpen ? 1 : 0}${closer.origCount % 3}` : closer.char;
    const floor = openersBottom.has(key) ? openersBottom.get(key) : bottom;
    let opener = closer.previous;
    let found = false;
    while (opener && opener !== bottom && opener !== floor) {
      // The "rule of 3": *foo**bar* is not <em>foo</em>... with a strong closer.
      const oddMatch =
        emphasis &&
        (closer.canOpen || opener.canClose) &&
        closer.origCount % 3 !== 0 &&
        (opener.origCount + closer.origCount) % 3 === 0;
      if (opener.char === closer.char && opener.canOpen && !oddMatch) {
        found = true;
        break;
      }
      opener = opener.previous;
    }
    if (found && tooDeep(parser.nodes, opener, closer)) found = false;
    if (found) {
      closer = pair(parser, opener, closer);
    } else {
      const old = closer;
      closer = closer.next;
      openersBottom.set(key, old.previous);
      if (!old.canOpen) removeDelimiter(parser, old);
    }
  }
  while (parser.delimiters && parser.delimiters !== bottom) removeDelimiter(parser, parser.delimiters);
}

function tooDeep(nodes, opener, closer) {
  const inner = nodes.slice(nodes.indexOf(opener.node) + 1, nodes.indexOf(closer.node));
  return nestingDepth(inner) >= MAX_INLINE_NESTING;
}

// Wrap the nodes between opener and closer; returns the closer to carry on from.
function pair(parser, opener, closer) {
  const use = opener.char in TAGS ? 2 : closer.count >= 2 && opener.count >= 2 ? 2 : 1;
  const type = TAGS[opener.char] ?? (use === 1 ? "em" : "strong");
  opener.count -= use;
  closer.count -= use;
  opener.node.value = opener.node.value.slice(use);
  closer.node.value = closer.node.value.slice(use);

  const nodes = parser.nodes;
  const from = nodes.indexOf(opener.node);
  const to = nodes.indexOf(closer.node);
  const inner = nodes.splice(from + 1, to - from - 1);
  nodes.splice(from + 1, 0, { type, children: inner, depth: nestingDepth(inner) + 1 });

  for (let between = closer.previous; between && between !== opener; ) {
    const previous = between.previous;
    removeDelimiter(parser, between);
    between = previous;
  }
  if (opener.count === 0) {
    nodes.splice(nodes.indexOf(opener.node), 1);
    removeDelimiter(parser, opener);
  }
  if (closer.count === 0) {
    nodes.splice(nodes.indexOf(closer.node), 1);
    const next = closer.next;
    removeDelimiter(parser, closer);
    return next;
  }
  return closer;
}

export function removeDelimiter(parser, delimiter) {
  if (delimiter.previous) delimiter.previous.next = delimiter.next;
  if (delimiter.next) delimiter.next.previous = delimiter.previous;
  else parser.delimiters = delimiter.previous;
}
