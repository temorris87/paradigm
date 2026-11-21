// The pieces of link syntax shared by inline links and reference definitions: labels,
// destinations and titles. Each reader takes (text, pos) and returns { value, end } or null.

const ESCAPABLE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

export function unescapeBackslashes(text) {
  return text.replace(ESCAPABLE, "$1");
}

/** [label], as it appears in the source (brackets included). */
export function readLinkLabel(text, pos) {
  const match = /^\[(?:[^\\[\]]|\\[\s\S]){0,999}\]/.exec(text.slice(pos));
  if (!match || !/\S/.test(match[0].slice(1, -1))) return null;
  return { value: match[0], end: pos + match[0].length };
}

/** Labels match case-insensitively and with runs of whitespace treated as one space. */
export function normalizeLabel(label) {
  return label.slice(1, -1).trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();
}

export function readLinkDestination(text, pos) {
  if (text[pos] === "<") {
    const match = /^<((?:[^<>\n\\]|\\[\s\S])*)>/.exec(text.slice(pos));
    return match ? { value: unescapeBackslashes(match[1]), end: pos + match[0].length } : null;
  }
  // A bare destination: no spaces or controls, parentheses balanced.
  let end = pos;
  let depth = 0;
  while (end < text.length) {
    const char = text[end];
    if (char === "\\" && /[!-/:-@[-`{-~]/.test(text[end + 1] ?? "")) {
      end += 2;
      continue;
    }
    if (char === "(") {
      depth += 1;
      if (depth > 32) return null;
    } else if (char === ")") {
      if (depth === 0) break;
      depth -= 1;
    } else if (/[\x00-\x20\x7f]/.test(char)) {
      break;
    }
    end += 1;
  }
  if (end === pos || depth !== 0) return null;
  return { value: unescapeBackslashes(text.slice(pos, end)), end };
}

export function readLinkTitle(text, pos) {
  const match = /^(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|\(((?:\\[\s\S]|[^()\\])*)\))/.exec(
    text.slice(pos),
  );
  if (!match) return null;
  const inner = match[1] ?? match[2] ?? match[3];
  return { value: unescapeBackslashes(inner), end: pos + match[0].length };
}

/** Skip spaces with at most one newline among them. */
export function skipSpacesAndNewline(text, pos) {
  const match = /^[ \t]*(?:\n[ \t]*)?/.exec(text.slice(pos));
  return pos + match[0].length;
}
