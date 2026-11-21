// Light colouring of raw Markdown, one line at a time. Pure: a line in, coloured spans out,
// as [{ from, to, cls }] with `to` exclusive. Fenced blocks need to know whether the line is
// inside one, so the state is passed along: null, "code" (``` or ~~~) or "math" ($$).
import { endsMath, readInlineMath, readMathOpener } from "../markdown/math.js";

const FENCE = /^\s*(```|~~~)/;
const MATH_OPENER = /^[ \t]*(?:>[ \t]?)*[ \t]*(?=\$\$)/; // "$$", also in a quote

/** The fence the line at `index` is inside, from the lines above it. */
export function fenceStateAt(lines, index) {
  let fence = null;
  for (let line = 0; line < index && line < lines.length; line += 1) fence = fenceAfter(lines[line], fence).fence;
  return fence;
}

// { fence: the state after this line, cls: the whole line's class, or null for an ordinary line }
function fenceAfter(text, fence) {
  if (fence === "math") return { fence: endsMath(text) ? null : "math", cls: "md-math" };
  if (FENCE.test(text)) return { fence: fence === "code" ? null : "code", cls: "md-fence" };
  if (fence === "code") return { fence, cls: "md-code-block" };
  const quote = MATH_OPENER.exec(text);
  const opener = quote && readMathOpener(text.slice(quote[0].length));
  if (opener) return { fence: opener.closed ? null : "math", cls: "md-math" };
  return { fence: null, cls: null };
}

export function tokenizeLine(text, fence) {
  const state = fenceAfter(text, fence);
  if (state.cls) return { tokens: [whole(text, state.cls)], fence: state.fence };
  const heading = /^(#{1,6})(\s|$)/.exec(text);
  if (heading) return { tokens: [whole(text, `md-h${heading[1].length}`)], fence: null };
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(text)) return { tokens: [whole(text, "md-hr")], fence: null };
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
  return { tokens, fence: null };
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

// Inline code and maths first: nothing inside them is coloured any other way.
function inlineTokens(text) {
  const tokens = [];
  const code = [];
  const codeRegex = /(`+)(.+?)\1/g;
  for (let match = codeRegex.exec(text); match; match = codeRegex.exec(text)) {
    code.push([match.index, match.index + match[0].length]);
    tokens.push({ from: match.index, to: match.index + match[0].length, cls: "md-code" });
  }
  for (const [from, to] of mathSpans(text, code)) {
    code.push([from, to]);
    tokens.push({ from, to, cls: "md-math" });
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

// "$...$" and "$$...$$" outside code spans, by the renderer's own rules (markdown/math.js).
function mathSpans(text, code) {
  const spans = [];
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    const inCode = code.find(([from, to]) => at >= from && at < to);
    if (inCode) {
      at = inCode[1] - 1;
    } else if (char === "\\") {
      at += 1;
    } else if (char === "$") {
      const found = readInlineMath(text, at);
      if (found) {
        spans.push([at, found.end]);
        at = found.end - 1;
      } else if (text[at + 1] === "$") {
        at += 1;
      }
    }
  }
  return spans;
}
