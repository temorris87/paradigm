// Link reference definitions ("[label]: url 'title'"). They sit at the start of a paragraph;
// takeReferences() removes them from the paragraph text and records them (first one wins).
import {
  normalizeLabel,
  readLinkDestination,
  readLinkLabel,
  readLinkTitle,
  skipSpacesAndNewline,
} from "./link-syntax.js";

export function takeReferences(text, references) {
  let rest = text;
  while (rest.startsWith("[")) {
    const definition = readDefinition(rest);
    if (!definition) break;
    const { label, destination, title, end } = definition;
    if (!references.has(label)) references.set(label, { destination, title });
    rest = rest.slice(end);
  }
  return rest;
}

function readDefinition(text) {
  const label = readLinkLabel(text, 0);
  if (!label || label.value.startsWith("[^") || text[label.end] !== ":") return null;
  const destination = readLinkDestination(text, skipSpacesAndNewline(text, label.end + 1));
  if (!destination) return null;
  let end = destination.end;
  let title = null;
  const titleStart = skipSpacesAndNewline(text, end);
  if (titleStart !== end) {
    const read = readLinkTitle(text, titleStart);
    if (read && atLineEnd(text, read.end)) {
      title = read.value;
      end = read.end;
    }
  }
  if (!atLineEnd(text, end)) return null;
  const lineEnd = text.indexOf("\n", end);
  return {
    label: normalizeLabel(label.value),
    destination: destination.value,
    title,
    end: lineEnd === -1 ? text.length : lineEnd + 1,
  };
}

function atLineEnd(text, pos) {
  return /^[ \t]*(?:\n|$)/.test(text.slice(pos));
}
