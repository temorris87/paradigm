// Live preview: how many editor rows a rendered unit takes. The HTML is laid out in a hidden
// box at the text area's width and its height read back; results are cached by HTML, so
// typing in one block never re-measures the others. Any change that makes old sizes wrong
// (a resize, an image loading, a callout folding) bumps `generation`.
export class PreviewMeasure {
  constructor(parent) {
    this.box = document.createElement("div");
    this.box.className = "pd-unit md-doc pd-measure";
    this.box.setAttribute("aria-hidden", "true");
    parent.append(this.box);
    this.cache = new Map();
    this.width = 0;
    this.rowHeight = 16;
    this.generation = 0;
  }

  /** The text area's width and row height, in pixels; old sizes go if either changed. */
  reset(width, rowHeight) {
    if (width === this.width && rowHeight === this.rowHeight) return;
    this.width = width;
    this.rowHeight = rowHeight || 16;
    this.box.style.width = `${width}px`;
    this.forgetAll();
  }

  forgetAll() {
    this.cache.clear();
    this.generation += 1;
  }

  rows(html) {
    let rows = this.cache.get(html);
    if (rows === undefined) {
      this.box.innerHTML = html;
      rows = this.box.getBoundingClientRect().height / this.rowHeight;
      this.box.replaceChildren();
      this.cache.set(html, rows);
    }
    return rows;
  }

  /** A unit on screen changed height by itself (an image loaded, a callout folded). */
  remeasure(html, node) {
    this.cache.set(html, node.getBoundingClientRect().height / this.rowHeight);
    this.generation += 1;
  }
}
