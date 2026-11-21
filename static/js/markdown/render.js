// Block tree -> HTML. Footnote definitions render nothing where they stand; their text goes
// in the footnote section at the end (renderFootnotes).
import { escapeHtml } from "./escape.js";
import { plainText, renderInlines, renderMathPlaceholder } from "./render-inline.js";

/** options: { idPrefix, breaks, resolveWikiLink } */
export function renderBlock(block, options, tight = false) {
  switch (block.type) {
    case "paragraph":
      return renderParagraph(block, options, tight);
    case "heading": {
      const tag = `h${block.level}`;
      return `<${tag} id="${escapeHtml(options.idPrefix + block.id)}">${renderInlines(block.inlines, options)}</${tag}>`;
    }
    case "hr":
      return "<hr>";
    case "code":
      return renderCode(block);
    case "math":
      return renderMathPlaceholder(block.tex, true, "div");
    case "quote":
      return `<blockquote>\n${renderChildren(block, options)}</blockquote>`;
    case "callout":
      return renderCallout(block, options);
    case "list":
      return renderList(block, options);
    case "table":
      return renderTable(block, options);
    case "footnote":
      return "";
    default:
      return "";
  }
}

function renderChildren(block, options, tight = false) {
  return block.children.map((child) => wrapLine(renderBlock(child, options, tight))).join("");
}

function wrapLine(html) {
  return html ? `${html}\n` : "";
}

function renderParagraph(block, options, tight, suffix = "") {
  const box = block.taskBox
    ? `<input type="checkbox" disabled${block.taskBox.checked ? " checked" : ""}>${block.inlines.length ? " " : ""}`
    : "";
  const inner = box + renderInlines(block.inlines, options) + suffix;
  return tight ? inner : `<p>${inner}</p>`;
}

function renderCode(block) {
  const language = block.fenced ? block.info.split(/\s+/)[0] : "";
  const cls = language ? ` class="language-${escapeHtml(language)}"` : "";
  const text = block.lines.map((line) => `${line}\n`).join("");
  return `<pre><code${cls}>${escapeHtml(text)}</code></pre>`;
}

function renderCallout(block, options) {
  const type = escapeHtml(block.calloutType);
  const title = renderInlines(block.titleInlines, options);
  // A title-only callout has no content box.
  const content = block.children.length
    ? `\n<div class="md-callout-content">\n${renderChildren(block, options)}</div>`
    : "";
  if (block.fold) {
    const open = block.fold === "+" ? " open" : "";
    return (
      `<details class="md-callout md-callout-${type}" data-callout="${type}"${open}>\n` +
      `<summary class="md-callout-title">${title}</summary>${content}\n</details>`
    );
  }
  return (
    `<div class="md-callout md-callout-${type}" data-callout="${type}">\n` +
    `<div class="md-callout-title">${title}</div>${content}\n</div>`
  );
}

function renderList(list, options) {
  const tag = list.ordered ? "ol" : "ul";
  const start = list.ordered && list.start !== 1 ? ` start="${list.start}"` : "";
  const items = list.children.map((item) => renderItem(item, options, list.tight)).join("\n");
  return `<${tag}${start}>\n${items}\n</${tag}>`;
}

/** One item of a list on its own, as a one-item list that keeps its number (live preview). */
export function renderListItem(list, index, options) {
  const tag = list.ordered ? "ol" : "ul";
  const number = list.ordered ? list.start + index : 1;
  const start = number !== 1 ? ` start="${number}"` : "";
  return `<${tag}${start}>\n${renderItem(list.children[index], options, list.tight)}\n</${tag}>`;
}

function renderItem(item, options, tight) {
  const cls = item.task ? ` class="md-task${item.task.checked ? " md-task-done" : ""}"` : "";
  let inner = item.children
    .map((child, index) => {
      const html = renderBlock(child, options, tight);
      // In a tight item, a paragraph flows straight into the <li>; other blocks get lines.
      return tight && child.type === "paragraph" && index === 0 ? html : `\n${html}`;
    })
    .join("");
  if (item.task && !item.children.some((child) => child.taskBox)) {
    inner = `<input type="checkbox" disabled${item.task.checked ? " checked" : ""}>${inner}`;
  }
  const last = item.children[item.children.length - 1];
  const closeOnNewLine = last && !(tight && last.type === "paragraph");
  return `<li${cls}>${inner}${closeOnNewLine ? "\n" : ""}</li>`;
}

const ALIGN_CLASS = { left: "md-align-left", center: "md-align-center", right: "md-align-right" };

function renderTable(table, options) {
  const cell = (tag, inlines, column) => {
    const align = table.align[column];
    const cls = align ? ` class="${ALIGN_CLASS[align]}"` : "";
    return `<${tag}${cls}>${renderInlines(inlines, options)}</${tag}>`;
  };
  const row = (tag, cells) => `<tr>${cells.map((inlines, column) => cell(tag, inlines, column)).join("")}</tr>`;
  const head = `<thead>\n${row("th", table.headInlines)}\n</thead>`;
  const body = table.rowInlines.length
    ? `\n<tbody>\n${table.rowInlines.map((cells) => row("td", cells)).join("\n")}\n</tbody>`
    : "";
  return `<table>\n${head}${body}\n</table>`;
}

/** The footnote section for the notes that were referred to, in order; "" if none. */
export function renderFootnotes(footnotes, options) {
  if (!footnotes.order.length) return "";
  const p = escapeHtml(options.idPrefix);
  const items = footnotes.order.map((note) => {
    const backs = [];
    for (let i = 1; i <= note.refCount; i += 1) {
      const id = `${p}fnref-${note.number}${i > 1 ? `-${i}` : ""}`;
      backs.push(
        `<a href="#${id}" class="md-footnote-back" aria-label="Back to reference ${note.number}">↩${i > 1 ? `<sup>${i}</sup>` : ""}</a>`,
      );
    }
    const back = ` ${backs.join(" ")}`;
    const children = note.children;
    const last = children[children.length - 1];
    let body = children
      .map((child) => (child === last && child.type === "paragraph" ? renderParagraph(child, options, false, back) : renderBlock(child, options)))
      .map(wrapLine)
      .join("");
    if (!last || last.type !== "paragraph") body += `${back.trim()}\n`;
    return `<li id="${p}fn-${note.number}">\n${body}</li>`;
  });
  return `<section class="md-footnotes">\n<hr>\n<ol>\n${items.join("\n")}\n</ol>\n</section>`;
}

export { plainText };
