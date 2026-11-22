// @mentions in text: "@PriyaShah" becomes a mention node { type: "mention", name }. The @ must
// start a word, so an email address ("a@b.com") is never one; nothing inside links or code is.
// Which person a name reaches is the host's (render-inline.js asks options.resolveMention).

export const MENTION = /(^|[^\p{L}\p{N}_@./:+-])@(\p{L}[\p{L}\p{N}_'-]*)/gu;
const NO_MENTIONS_INSIDE = new Set(["link", "image", "code", "wikilink"]);

export function linkMentions(nodes) {
  return nodes.flatMap((node) => {
    if (node.type === "text") return splitText(node.value);
    if (node.children && !NO_MENTIONS_INSIDE.has(node.type)) node.children = linkMentions(node.children);
    return [node];
  });
}

/** "@Priya's" names Priya: a possessive 's, or a trailing ' or -, is not part of the name. */
export function trimName(name) {
  return name.replace(/'s$/i, "").replace(/['-]+$/, "");
}

function splitText(text) {
  const out = [];
  let from = 0;
  MENTION.lastIndex = 0;
  for (let match = MENTION.exec(text); match; match = MENTION.exec(text)) {
    const start = match.index + match[1].length;
    const name = trimName(match[2]);
    if (start > from) out.push({ type: "text", value: text.slice(from, start) });
    out.push({ type: "mention", name });
    from = start + 1 + name.length;
    MENTION.lastIndex = from;
  }
  if (from < text.length) out.push({ type: "text", value: text.slice(from) });
  return out.length ? out : [{ type: "text", value: text }];
}
