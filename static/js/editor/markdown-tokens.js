// Light colouring of raw Markdown, one line at a time. Pure: a line in, coloured spans out,
// as [{ from, to, cls }] with `to` exclusive. Code fences need to know whether the line is
// inside one, so the state is passed along.

const FENCE = /^\s*(```|~~~)/;

/** Is `index` inside a fenced code block? Counts the fences above it. */
export function fenceStateAt(lines, index) {
  let inFence = false;
  for (let line = 0; line < index && line < lines.length; line += 1) {
    if (FENCE.test(lines[line])) inFence = !inFence;
  }
  return inFence;
}

export function tokenizeLine(text, inFence) {
  if (FENCE.test(text)) return { tokens: [whole(text, "md-fence")], inFence: !inFence };
  if (inFence) return { tokens: [whole(text, "md-code-block")], inFence };
  const heading = /^(#{1,6})(\s|$)/.exec(text);
  if (heading) return { tokens: [whole(text, `md-h${heading[1].length}`)], inFence };
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(text)) return { tokens: [whole(text, "md-hr")], inFence };
  const tokens = [];
  let from = 0;
  const quote = /^\s*(>\s?)+/.exec(text);
  if (quote) {
    tokens.push(whole(text, "md-quote"));
    tokens.push({ from: 0, to: quote[0].length, cls: "md-quote-mark" });
    from = quote[0].length;
  }
  const list = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\](?=\s|$))?/.exec(text.slice(from));
  if (list) {
    const markerStart = from + list[1].length;
    tokens.push({ from: markerStart, to: markerStart + list[2].length, cls: "md-list" });
    if (list[4]) {
      const boxStart = from + list[0].length - list[4].length;
      const done = list[4][1] !== " ";
      tokens.push({ from: boxStart, to: boxStart + 3, cls: done ? "md-task-done" : "md-task" });
    }
  }
  tokens.push(...inlineTokens(text));
  return { tokens, inFence };
}

function whole(text, cls) {
  return { from: 0, to: text.length, cls };
}

const INLINE = [
  // [text](url) and ![alt](url)
  { regex: /!?\[[^\]\n]*\]\([^)\s]*(?:\s+"[^"]*")?\)/g, cls: "md-link" },
  // <https://...> and bare URLs
  { regex: /<https?:\/\/[^>\s]+>|\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, cls: "md-link" },
  { regex: /(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, cls: "md-bold" },
  { regex: /(?<![\w*])\*(?=[^\s*])([^*]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=[^\s_])([^_]+?)(?<=\S)_(?![\w_])/g, cls: "md-italic" },
  { regex: /~~(?=\S)(.+?)(?<=\S)~~/g, cls: "md-strike" },
];

// Inline code first: nothing inside backticks is coloured any other way.
function inlineTokens(text) {
  const tokens = [];
  const code = [];
  const codeRegex = /(`+)(.+?)\1/g;
  for (let match = codeRegex.exec(text); match; match = codeRegex.exec(text)) {
    code.push([match.index, match.index + match[0].length]);
    tokens.push({ from: match.index, to: match.index + match[0].length, cls: "md-code" });
  }
  const links = [];
  const overlaps = (ranges, from, to) => ranges.some(([start, end]) => from < end && to > start);
  for (const { regex, cls } of INLINE) {
    regex.lastIndex = 0;
    for (let match = regex.exec(text); match; match = regex.exec(text)) {
      const from = match.index;
      const to = from + match[0].length;
      if (overlaps(code, from, to)) continue;
      // The URL inside [text](url) is already part of that link.
      if (cls === "md-link") {
        if (overlaps(links, from, to)) continue;
        links.push([from, to]);
      }
      tokens.push({ from, to, cls });
    }
  }
  return tokens;
}
