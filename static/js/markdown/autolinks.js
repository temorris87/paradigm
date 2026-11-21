// GFM's extended autolinks: bare "https://..." and "www...." in text become links. Trailing
// punctuation is left out ("see https://example.com." links without the full stop), and so is
// a closing parenthesis with no opening one in the URL.

const BARE_URL = /(^|[\s*_~(])((?:https?:\/\/|www\.)[\p{L}\p{N}_-][^\s<]*)/gu;
const NO_LINKS_INSIDE = new Set(["link", "image", "code", "wikilink"]);

export function linkBareUrls(nodes) {
  return nodes.flatMap((node) => {
    if (node.type === "text") return splitText(node.value);
    if (node.children && !NO_LINKS_INSIDE.has(node.type)) node.children = linkBareUrls(node.children);
    return [node];
  });
}

function splitText(text) {
  const out = [];
  let from = 0;
  BARE_URL.lastIndex = 0;
  for (let match = BARE_URL.exec(text); match; match = BARE_URL.exec(text)) {
    const start = match.index + match[1].length;
    const url = trimUrl(match[2]);
    if (start > from) out.push({ type: "text", value: text.slice(from, start) });
    out.push({
      type: "link",
      destination: url.startsWith("www.") ? `http://${url}` : url,
      title: null,
      children: [{ type: "text", value: url }],
    });
    from = start + url.length;
    BARE_URL.lastIndex = from;
  }
  if (from < text.length) out.push({ type: "text", value: text.slice(from) });
  return out;
}

function trimUrl(url) {
  for (;;) {
    const last = url[url.length - 1];
    if ("?!.,:*_~'\"".includes(last)) url = url.slice(0, -1);
    else if (last === ")" && count(url, "(") < count(url, ")")) url = url.slice(0, -1);
    else if (last === ";" && /&[a-z0-9]+;$/i.test(url)) url = url.replace(/&[a-z0-9]+;$/i, "");
    else return url;
  }
}

function count(text, char) {
  return text.split(char).length - 1;
}
