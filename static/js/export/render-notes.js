// The export's notes as HTML: one <section> per note, a list of them when there are several,
// and wiki links pointing inside the file. Pure.
import { escapeHtml } from "../markdown/escape.js";
import { renderMarkdown } from "../markdown/index.js";
import { slugify } from "../markdown/slug.js";
import { resolveLink } from "../notes/resolve.js";

export const sectionId = (id) => `note-${id}`;
// Each note's heading and footnote ids get their own prefix, so two notes never clash.
export const idPrefix = (id) => `n${id}-`;

/** notes: [{ id, title, body }] as collectNotes gives them, the exported note first. */
export function renderNotes(tree, notes) {
  const held = new Set(notes.map((note) => note.id));
  const sections = notes.map((note, index) => {
    const body = renderMarkdown(note.body, {
      idPrefix: idPrefix(note.id),
      resolveWikiLink: (link) => linkInFile(tree, held, note.id, link),
    });
    const contents = index === 0 ? renderContents(notes) : "";
    return `<section class="export-note" id="${sectionId(note.id)}">\n` +
      `<h1 class="export-title">${escapeHtml(note.title)}</h1>\n${contents}` +
      `<div class="md-doc">\n${body}</div>\n</section>`;
  });
  return `${sections.join("\n")}\n`;
}

function linkInFile(tree, held, fromId, link) {
  const found = resolveLink(tree, fromId, link.target).note;
  if (!found || !held.has(found.id)) return { plain: true };
  const href = link.heading ? `#${idPrefix(found.id)}${slugify(link.heading)}` : `#${sectionId(found.id)}`;
  return { href, exists: true };
}

function renderContents(notes) {
  if (notes.length < 2) return "";
  const items = notes
    .slice(1)
    .map((note) => `<li><a href="#${sectionId(note.id)}">${escapeHtml(note.title)}</a></li>`);
  return `<nav class="export-contents">\n<p>Also in this file</p>\n<ul>\n${items.join("\n")}\n</ul>\n</nav>\n`;
}
