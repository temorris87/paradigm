// Inline nodes -> HTML. Every text and attribute value is escaped here; URLs go through the
// allowlist in urls.js, and a link whose URL fails it shows only its text.
import { escapeHtml } from "./escape.js";
import { slugify } from "./slug.js";
import { isExternal, safeImageUrl, safeLinkUrl } from "./urls.js";

/** options: { idPrefix, breaks, resolveWikiLink } */
export function renderInlines(nodes, options) {
  return nodes.map((node) => renderInline(node, options)).join("");
}

function renderInline(node, options) {
  switch (node.type) {
    case "text":
      return escapeHtml(node.value);
    case "softbreak":
      return options.breaks ? "<br>\n" : "\n";
    case "break":
      return "<br>\n";
    case "code":
      return `<code>${escapeHtml(node.value)}</code>`;
    case "math":
      return renderMathPlaceholder(node.tex, node.display, "span");
    case "em":
    case "strong":
    case "del":
    case "mark":
      return `<${node.type}>${renderInlines(node.children, options)}</${node.type}>`;
    case "link":
      return renderLink(node, options);
    case "image":
      return renderImage(node);
    case "wikilink":
      return renderWikiLink(node, options);
    case "footnoteRef":
      return renderFootnoteRef(node, options);
    default:
      return "";
  }
}

/**
 * Maths stays TeX source here: this module has no DOM, and KaTeX may only draw into an
 * element (static/js/math/typeset.js fills these in once they are on the page).
 */
export function renderMathPlaceholder(tex, display, tag) {
  const cls = display ? "md-math md-math-display" : "md-math";
  return `<${tag} class="${cls}">${escapeHtml(tex)}</${tag}>`;
}

function renderLink(node, options) {
  const inner = renderInlines(node.children, options);
  const href = safeLinkUrl(node.destination);
  if (href === null) return inner;
  const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
  return `<a href="${escapeHtml(href)}"${title}${newTab(href)}>${inner}</a>`;
}

function newTab(href) {
  return isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
}

function renderImage(node) {
  const alt = escapeHtml(plainText(node.children));
  const src = safeImageUrl(node.destination);
  if (src === null) return alt;
  const title = node.title ? ` title="${escapeHtml(node.title)}"` : "";
  return `<img src="${escapeHtml(src)}" alt="${alt}"${title}>`;
}

function renderWikiLink(node, options) {
  const target = node.heading ? `${node.target}#${node.heading}` : node.target;
  const shown = node.alias || [node.target, node.heading].filter(Boolean).join(" > ");
  const text = escapeHtml(shown);
  const data = ` data-target="${escapeHtml(target)}"`;
  if (!node.target && node.heading) {
    // [[#Heading]]: a heading in this same note.
    const href = `#${options.idPrefix}${slugify(node.heading)}`;
    return `<a class="md-wikilink" href="${escapeHtml(href)}"${data}>${text}</a>`;
  }
  const resolved = options.resolveWikiLink ? options.resolveWikiLink(node) : null;
  // { plain: true }: show only the text (an export leaves out links to notes it doesn't hold).
  if (resolved?.plain) return text;
  const href = resolved?.href ? safeLinkUrl(resolved.href) : null;
  // A note that doesn't exist yet may have no address at all: { href: null, exists: false }.
  const missing = resolved?.exists === false ? " md-wikilink-missing" : "";
  const hrefAttr = href === null ? "" : ` href="${escapeHtml(href)}"`;
  return `<a class="md-wikilink${missing}"${hrefAttr}${data}>${text}</a>`;
}

function renderFootnoteRef(node, options) {
  const p = escapeHtml(options.idPrefix);
  const id = `${p}fnref-${node.number}${node.refIndex > 1 ? `-${node.refIndex}` : ""}`;
  return `<sup class="md-footnote-ref"><a href="#${p}fn-${node.number}" id="${id}">${node.number}</a></sup>`;
}

/** The text of inline nodes without markup (image alt text, heading ids). */
export function plainText(nodes) {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "code") return node.value;
      if (node.type === "math") return node.tex;
      if (node.type === "softbreak" || node.type === "break") return " ";
      if (node.type === "wikilink") return node.alias || node.target || node.heading;
      if (node.type === "footnoteRef") return "";
      return node.children ? plainText(node.children) : "";
    })
    .join("");
}
