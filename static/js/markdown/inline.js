// The inline parser: text of a paragraph, heading or table cell in, a list of inline nodes
// out. Nodes: text, code, math, em, strong, del, mark, link, image, break, softbreak,
// wikilink, footnoteRef. Brackets and emphasis are resolved with the CommonMark stacks; bare URLs are
// linked afterwards (autolinks.js).
import { linkBareUrls } from "./autolinks.js";
import { readInlineMath } from "./math.js";
import { MAX_INLINE_NESTING, nestingDepth, processEmphasis, scanDelimiterRun } from "./delimiters.js";
import {
  normalizeLabel,
  readLinkDestination,
  readLinkLabel,
  readLinkTitle,
  skipSpacesAndNewline,
} from "./link-syntax.js";

const PLAIN_RUN = /^[^\n\\`$*_~=[\]!<]+/;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const WIKI_LINK = /^\[\[([^[\]|\n]+)(?:\|([^[\]\n]*))?\]\]/;
const FOOTNOTE_REF = /^\[\^([^\]\s]+)\]/;
const URI_AUTOLINK = /^<([A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*)>/;
const EMAIL_AUTOLINK =
  /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;

/** context: { references: Map, footnotes: FootnoteRegistry } */
export function parseInline(text, context) {
  return new InlineParser(text, context).parse();
}

class InlineParser {
  constructor(text, context) {
    this.text = text;
    this.context = context;
    this.pos = 0;
    this.nodes = [];
    this.delimiters = null; // top of the delimiter stack
    this.brackets = null; // top of the bracket stack
  }

  parse() {
    while (this.pos < this.text.length) this.step();
    processEmphasis(this, null);
    return linkBareUrls(mergeText(this.nodes));
  }

  step() {
    const char = this.text[this.pos];
    const handled =
      (char === "\n" && this.newline()) ||
      (char === "\\" && this.backslash()) ||
      (char === "`" && this.codeSpan()) ||
      (char === "$" && this.math()) ||
      ("*_~=".includes(char) && this.delimiterRun()) ||
      (char === "[" && (this.wikiLink() || this.footnoteRef() || this.openBracket())) ||
      (char === "!" && this.imageBracket()) ||
      (char === "]" && this.closeBracket()) ||
      (char === "<" && this.autolink());
    if (handled) return;
    const run = PLAIN_RUN.exec(this.text.slice(this.pos));
    const length = run ? run[0].length : 1;
    this.pushText(this.text.slice(this.pos, this.pos + length));
    this.pos += length;
  }

  pushText(value) {
    const node = { type: "text", value };
    this.nodes.push(node);
    return node;
  }

  newline() {
    this.pos += 1;
    const last = this.nodes[this.nodes.length - 1];
    let hard = false;
    if (last && last.type === "text") {
      hard = / {2,}$/.test(last.value);
      last.value = last.value.replace(/[ \t]+$/, "");
    }
    this.nodes.push({ type: hard ? "break" : "softbreak" });
    while (this.text[this.pos] === " " || this.text[this.pos] === "\t") this.pos += 1;
    return true;
  }

  backslash() {
    const next = this.text[this.pos + 1];
    if (next === "\n") {
      this.pos += 2;
      this.nodes.push({ type: "break" });
      while (this.text[this.pos] === " " || this.text[this.pos] === "\t") this.pos += 1;
    } else if (next && ASCII_PUNCT.test(next)) {
      this.pos += 2;
      this.pushText(next);
    } else {
      this.pos += 1;
      this.pushText("\\");
    }
    return true;
  }

  codeSpan() {
    const ticks = /^`+/.exec(this.text.slice(this.pos))[0];
    const start = this.pos + ticks.length;
    const closer = /`+/g;
    closer.lastIndex = start;
    for (let match = closer.exec(this.text); match; match = closer.exec(this.text)) {
      if (match[0].length !== ticks.length) continue;
      let value = this.text.slice(start, match.index).replace(/\n/g, " ");
      if (/^ .*[^ ].* $/s.test(value)) value = value.slice(1, -1);
      this.nodes.push({ type: "code", value });
      this.pos = match.index + ticks.length;
      return true;
    }
    this.pushText(ticks); // no closer: the backticks are text
    this.pos = start;
    return true;
  }

  math() {
    const found = readInlineMath(this.text, this.pos);
    if (found) {
      this.nodes.push({ type: "math", tex: found.tex, display: found.display });
      this.pos = found.end;
    } else {
      // An unclosed "$$" is text as a pair, so its second "$" cannot open maths.
      const dollars = this.text[this.pos + 1] === "$" ? "$$" : "$";
      this.pushText(dollars);
      this.pos += dollars.length;
    }
    return true;
  }

  delimiterRun() {
    const char = this.text[this.pos];
    const run = scanDelimiterRun(this.text, this.pos);
    const node = this.pushText(this.text.slice(this.pos, this.pos + run.count));
    this.pos += run.count;
    const counts = char === "*" || char === "_" || run.count === 2;
    if (counts && (run.canOpen || run.canClose)) {
      const delimiter = {
        char,
        count: run.count,
        origCount: run.count,
        node,
        canOpen: run.canOpen,
        canClose: run.canClose,
        previous: this.delimiters,
        next: null,
      };
      if (this.delimiters) this.delimiters.next = delimiter;
      this.delimiters = delimiter;
    }
    return true;
  }

  wikiLink() {
    const match = WIKI_LINK.exec(this.text.slice(this.pos));
    if (!match || !match[1].trim()) return false;
    const [target, ...heading] = match[1].split("#");
    this.nodes.push({
      type: "wikilink",
      target: target.trim(),
      heading: heading.join("#").trim(),
      alias: match[2] === undefined ? null : match[2].trim(),
    });
    this.pos += match[0].length;
    return true;
  }

  footnoteRef() {
    const match = FOOTNOTE_REF.exec(this.text.slice(this.pos));
    const found = match && this.context.footnotes.refer(match[1]);
    if (!found) return false;
    this.nodes.push({ type: "footnoteRef", ...found });
    this.pos += match[0].length;
    return true;
  }

  openBracket() {
    this.addBracket(this.pushText("["), this.pos, false);
    this.pos += 1;
    return true;
  }

  imageBracket() {
    // "![[...]]" is an Obsidian embed, not supported yet: the "!" stays text.
    if (this.text[this.pos + 1] !== "[" || this.text[this.pos + 2] === "[") return false;
    this.addBracket(this.pushText("!["), this.pos + 1, true);
    this.pos += 2;
    return true;
  }

  addBracket(node, index, image) {
    if (this.brackets) this.brackets.bracketAfter = true;
    this.brackets = {
      node,
      index,
      image,
      active: true,
      bracketAfter: false,
      previous: this.brackets,
      previousDelimiter: this.delimiters,
    };
  }

  closeBracket() {
    this.pos += 1;
    const opener = this.brackets;
    if (!opener || !opener.active) {
      if (opener) this.brackets = opener.previous;
      this.pushText("]");
      return true;
    }
    const afterBracket = this.pos;
    const target = this.inlineTarget() ?? this.referenceTarget(opener);
    if (!target || this.tooDeep(opener)) {
      this.pos = afterBracket;
      this.brackets = opener.previous;
      this.pushText("]");
      return true;
    }
    processEmphasis(this, opener.previousDelimiter);
    const start = this.nodes.indexOf(opener.node);
    const children = this.nodes.splice(start).slice(1);
    const depth = nestingDepth(children) + 1;
    this.nodes.push({ type: opener.image ? "image" : "link", ...target, children, depth });
    this.brackets = opener.previous;
    // No links inside links: earlier "[" can no longer open one.
    if (!opener.image) {
      for (let earlier = this.brackets; earlier; earlier = earlier.previous) {
        if (!earlier.image) earlier.active = false;
      }
    }
    return true;
  }

  tooDeep(opener) {
    return nestingDepth(this.nodes.slice(this.nodes.indexOf(opener.node) + 1)) >= MAX_INLINE_NESTING;
  }

  // "(destination 'title')" right after "]".
  inlineTarget() {
    const text = this.text;
    if (text[this.pos] !== "(") return null;
    let pos = skipSpacesAndNewline(text, this.pos + 1);
    let destination = "";
    if (text[pos] !== ")") {
      const read = readLinkDestination(text, pos);
      if (!read) return null;
      destination = read.value;
      pos = read.end;
    }
    let title = null;
    const titleStart = skipSpacesAndNewline(text, pos);
    if (titleStart !== pos) {
      const read = readLinkTitle(text, titleStart);
      if (read) {
        title = read.value;
        pos = skipSpacesAndNewline(text, read.end);
      } else {
        pos = titleStart;
      }
    }
    if (text[pos] !== ")") return null;
    this.pos = pos + 1;
    return { destination, title };
  }

  // "[label]", "[]" or nothing after "]": look the label up among the definitions.
  referenceTarget(opener) {
    const after = this.pos;
    const label = readLinkLabel(this.text, after);
    let raw = null;
    if (label) raw = label.value;
    else if (!opener.bracketAfter) raw = this.text.slice(opener.index, after);
    const collapsed = this.text.startsWith("[]", after);
    if (!label && collapsed && opener.bracketAfter) raw = null;
    const reference = raw && this.context.references.get(normalizeLabel(raw));
    if (!reference) return null;
    if (label) this.pos = label.end;
    else if (collapsed) this.pos = after + 2;
    return { destination: reference.destination, title: reference.title };
  }

  autolink() {
    const rest = this.text.slice(this.pos);
    const email = EMAIL_AUTOLINK.exec(rest);
    const uri = !email && URI_AUTOLINK.exec(rest);
    const match = email || uri;
    if (!match) return false;
    this.nodes.push({
      type: "link",
      destination: email ? `mailto:${match[1]}` : match[1],
      title: null,
      children: [{ type: "text", value: match[1] }],
    });
    this.pos += match[0].length;
    return true;
  }
}

/** Join neighbouring text nodes, and drop empty ones left by emphasis. */
function mergeText(nodes) {
  const out = [];
  for (const node of nodes) {
    delete node.depth;
    if (node.children) node.children = mergeText(node.children);
    const last = out[out.length - 1];
    if (node.type === "text") {
      if (!node.value) continue;
      if (last && last.type === "text") {
        last.value += node.value;
        continue;
      }
    }
    out.push(node);
  }
  return out;
}
