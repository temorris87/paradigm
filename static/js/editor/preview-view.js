// Live preview: the DOM nodes for rendered units. A node whose HTML has not changed is kept
// from one redraw to the next, so images don't flicker while typing, a folded callout stays
// as it was, and a link being clicked is still there when the click lands.
//
// The HTML comes from the Markdown renderer (static/js/markdown/), which escapes every value
// and allows only safe URL schemes. Maths arrives as TeX placeholders and is drawn here.
import { typesetMath } from "../math/typeset.js";

export class PreviewView {
  /** onResize(html, node): the node changed height by itself. */
  constructor({ onResize }) {
    this.onResize = onResize;
    this.nodes = new Map(); // html -> nodes drawn last time
    this.previous = new Map();
  }

  begin() {
    this.previous = this.nodes;
    this.nodes = new Map();
  }

  /** The node for a rendered unit; skipPx of it scrolled off the top of the screen. */
  node(unit, skipPx) {
    const node = this.previous.get(unit.html)?.shift() ?? this.create(unit.html);
    if (!this.nodes.has(unit.html)) this.nodes.set(unit.html, []);
    this.nodes.get(unit.html).push(node);
    node.dataset.line = String(unit.start);
    node.dataset.end = String(unit.end);
    node.style.marginTop = skipPx > 0 ? `${-skipPx}px` : "";
    return node;
  }

  create(html) {
    const node = document.createElement("div");
    node.className = "pd-unit md-doc";
    node.innerHTML = html;
    typesetMath(node);
    for (const link of node.querySelectorAll("a[href]")) {
      // Tab leaves the editor, so it must not stop on links inside it.
      link.tabIndex = -1;
      // Anything but a "#" jump opens in a new tab, never in place of the app.
      if (!link.getAttribute("href").startsWith("#")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }
    const resized = () => this.onResize(html, node);
    for (const image of node.querySelectorAll("img")) image.addEventListener("load", resized);
    for (const details of node.querySelectorAll("details")) details.addEventListener("toggle", resized);
    return node;
  }
}
