// The live-preview layout (see text-layout.js for the interface): a Markdown unit away from
// the cursor is one rendered piece, as many rows tall as it measures; everything else is
// raw text. Pure: the measuring is injected, so tests pass a fake.
//
//   new PreviewLayout({ measure })   measure: { rows(html) -> rows, generation }
//                                    (generation changes whenever old sizes go stale)
import { overlapsAny, buildUnits, rawRanges } from "./preview-units.js";
import { textUnit } from "./text-layout.js";

export class PreviewLayout {
  constructor({ measure }) {
    this.measure = measure;
    this.buf = null;
    this.version = -1;
    this.model = null;
    this.options = {};
  }

  /** Renderer options (resolveWikiLink). New options: every unit renders again. */
  setOptions(options) {
    this.options = { ...options };
    this.version = -1;
  }

  /** The units of the current text, parsed once per change. */
  modelFor(vim) {
    if (this.buf !== vim.buf || this.version !== vim.buf.version) {
      this.buf = vim.buf;
      this.version = vim.buf.version;
      this.model = buildUnits(vim.buf.getText(), vim.buf.lineCount, this.options);
    }
    return this.model;
  }

  enabled(vim) {
    return Boolean(vim.options.preview);
  }

  unitAt(vim, line) {
    if (!this.enabled(vim)) return textUnit(vim, line);
    const model = this.modelFor(vim);
    const unit = model.units[model.byLine[line]];
    if (!unit || overlapsAny(unit, rawRanges(vim))) return textUnit(vim, line);
    const html = unit.html();
    // A block that renders to nothing (a footnote definition) stays readable as raw text.
    if (!html) return textUnit(vim, line);
    if (unit.generation !== this.measure.generation) {
      unit.rows = this.measure.rows(html);
      unit.generation = this.measure.generation;
    }
    return { start: unit.start, end: unit.end, rows: unit.rows, rendered: true, html };
  }

  /** The line a "#id" link points at (a heading or a footnote), or null. */
  anchorLine(vim, id) {
    if (!this.enabled(vim)) return null;
    return this.modelFor(vim).anchors.get(id) ?? null;
  }
}
