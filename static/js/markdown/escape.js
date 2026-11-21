// The one way text and attribute values reach the HTML output. Everything a note contains is
// escaped, so raw HTML in a note shows as text and nothing can break out of an attribute.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ENTITIES[char]);
}
