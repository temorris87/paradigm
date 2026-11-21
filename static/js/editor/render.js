// Draws the engine's state: the lines on screen, the cursor, the selection, search matches
// and the status line. Only the visible lines are built, so long notes stay fast.
// Long lines are cut into rows of exactly view.width characters, the same rule the layout
// uses, so what the engine thinks is on screen is what is on screen. In live preview a
// rendered unit is drawn by preview-view.js, as tall as the layout measured it.
import { fenceStateAt, tokenizeLine } from "./markdown-tokens.js";
import { compilePattern, lineMatches } from "./search.js";
import { bottomLine, unitAt } from "./view.js";
import { visualRegion } from "./visual.js";

const MODE_LABELS = {
  insert: "-- INSERT --",
  replace: "-- REPLACE --",
  char: "-- VISUAL --",
  line: "-- VISUAL LINE --",
  block: "-- VISUAL BLOCK --",
};

const CURSOR_CLASSES = { insert: "pd-cursor-bar", replace: "pd-cursor-under" };

export class EditorView {
  constructor({ text, status, preview = null }) {
    this.text = text;
    this.status = status;
    this.preview = preview;
    this.rowHeight = 16;
    this.patternCache = { key: null, regex: null };
  }

  /** How many rows and columns of text fit. */
  measure() {
    const probe = document.createElement("div");
    probe.className = "pd-row pd-probe";
    const sample = document.createElement("span");
    sample.textContent = "M".repeat(10);
    probe.append(sample);
    this.text.append(probe);
    const charWidth = sample.getBoundingClientRect().width / 10 || 8;
    const rowHeight = probe.getBoundingClientRect().height || 16;
    probe.remove();
    this.charWidth = charWidth;
    this.rowHeight = rowHeight;
    return {
      width: Math.max(1, Math.floor(this.text.clientWidth / charWidth)),
      height: Math.max(1, Math.floor(this.text.clientHeight / rowHeight)),
    };
  }

  render(vim, { syntax = true } = {}) {
    this.text.classList.toggle("pd-text--nowrap", !vim.options.wrap);
    this.text.replaceChildren(...this.lineNodes(vim, syntax));
    this.renderStatus(vim);
  }

  lineNodes(vim, syntax) {
    const nodes = [];
    const selection = vim.mode === "visual" && vim.visual ? visualRegion(vim) : null;
    const regex = this.searchRegex(vim);
    let fence = syntax ? fenceStateAt(vim.buf.lines, vim.view.top) : null;
    this.preview?.begin();
    let rows = -vim.view.skip;
    let line = vim.view.top;
    for (; line <= vim.buf.lastLine && rows < vim.view.height; line += 1) {
      const unit = unitAt(vim, line);
      if (unit.rendered) {
        nodes.push(this.preview.node(unit, line === vim.view.top ? vim.view.skip * this.rowHeight : 0));
        if (syntax) for (let at = unit.start; at <= unit.end; at += 1) fence = tokenizeLine(vim.buf.line(at), fence).fence;
        rows += unit.rows;
        line = unit.end;
        continue;
      }
      const text = vim.buf.line(line);
      const decorations = [];
      if (syntax) {
        const result = tokenizeLine(text, fence);
        fence = result.fence;
        decorations.push(...result.tokens);
      }
      if (regex) {
        for (const match of lineMatches(regex, text)) {
          if (match.length > 0) decorations.push({ from: match.col, to: match.col + match.length, cls: "pd-match" });
        }
      }
      if (vim.incsearch && vim.incsearch.pos.line === line) {
        const { col } = vim.incsearch.pos;
        decorations.push({ from: col, to: col + Math.max(1, vim.incsearch.length), cls: "pd-match-current" });
      }
      const selected = selection && selectionOnLine(vim, selection, line);
      if (selected) decorations.push({ ...selected, cls: "pd-selection" });
      let extraCell = false;
      if (vim.cursor.line === line && vim.mode !== "cmdline") {
        const cls = CURSOR_CLASSES[vim.mode] ?? "pd-cursor";
        decorations.push({ from: vim.cursor.col, to: vim.cursor.col + 1, cls });
        extraCell = vim.cursor.col >= text.length;
      }
      if (selected && selected.to > text.length) extraCell = true;
      nodes.push(this.lineNode(vim, line, text, decorations, extraCell));
      rows += unit.rows;
    }
    for (; rows < vim.view.height; rows += 1) {
      const filler = document.createElement("div");
      filler.className = "pd-line pd-line--end";
      filler.textContent = "~";
      nodes.push(filler);
    }
    return nodes;
  }

  lineNode(vim, line, text, decorations, extraCell) {
    const node = document.createElement("div");
    node.className = "pd-line";
    node.dataset.line = String(line);
    const cells = text.length + (extraCell ? 1 : 0);
    const width = vim.view.width;
    const chunks = [];
    if (!vim.options.wrap) chunks.push([vim.view.left, Math.min(cells, vim.view.left + width)]);
    else for (let start = 0; start === 0 || start < cells; start += width) chunks.push([start, Math.min(cells, start + width)]);
    for (const [start, end] of chunks) {
      const row = document.createElement("div");
      row.className = "pd-row";
      row.dataset.line = String(line);
      row.dataset.start = String(start);
      row.append(...spans(text, decorations, start, end));
      node.append(row);
    }
    return node;
  }

  searchRegex(vim) {
    const { pattern, highlight } = vim.search;
    if (!pattern || !highlight || !vim.options.hlsearch) return null;
    const key = `${pattern}\u0000${vim.options.ignorecase}${vim.options.smartcase}`;
    if (this.patternCache.key !== key) {
      let regex = null;
      try {
        regex = compilePattern(pattern, vim.options);
      } catch {
        regex = null;
      }
      this.patternCache = { key, regex };
    }
    return this.patternCache.regex;
  }

  renderStatus(vim) {
    const left = document.createElement("span");
    left.className = "pd-status__left";
    if (vim.mode === "cmdline") {
      left.textContent = vim.cmdline.type + vim.cmdline.text;
      const cursor = document.createElement("span");
      cursor.className = "pd-cmdline-cursor";
      cursor.textContent = " ";
      left.append(cursor);
    } else if (vim.message) {
      left.textContent = vim.message.text;
      left.classList.toggle("pd-status__error", vim.message.error);
    } else {
      const label = vim.insertReturn ? "-- (insert) --" : MODE_LABELS[vim.mode === "visual" ? vim.visual.mode : vim.mode];
      left.textContent = label ?? "";
      left.classList.add("pd-status__mode");
    }
    const right = document.createElement("span");
    right.className = "pd-status__right";
    const pending = document.createElement("span");
    pending.className = "pd-status__pending";
    pending.textContent = vim.pending.join("") || selectionSize(vim);
    const ruler = document.createElement("span");
    ruler.textContent = `${vim.cursor.line + 1}:${vim.cursor.col + 1}`;
    const where = document.createElement("span");
    where.textContent = scrollPosition(vim);
    right.append(pending, ruler, where);
    if (vim.readOnly) {
      const flag = document.createElement("span");
      flag.textContent = "[read-only]";
      right.append(flag);
    }
    this.status.replaceChildren(left, right);
  }

  /** The text position under a mouse point, or null. */
  positionAt(clientX, clientY) {
    for (const row of this.text.querySelectorAll(".pd-row, .pd-unit")) {
      const box = row.getBoundingClientRect();
      if (clientY < box.top || clientY >= box.bottom) continue;
      // A rendered unit: its first line (where in the source a click lands isn't tracked).
      if (row.classList.contains("pd-unit")) return { line: Number(row.dataset.line), col: 0 };
      const col = Number(row.dataset.start) + Math.max(0, Math.floor((clientX - box.left) / (this.charWidth || 8)));
      return { line: Number(row.dataset.line), col };
    }
    return null;
  }

  cursorBox() {
    const cursor = this.text.querySelector(".pd-cursor, .pd-cursor-bar, .pd-cursor-under");
    return cursor ? cursor.getBoundingClientRect() : null;
  }
}

// The columns the selection covers on one line; `to` past the end means the line break.
function selectionOnLine(vim, region, line) {
  const length = vim.buf.lineLength(line);
  if (region.kind === "line") {
    return line >= region.first && line <= region.last ? { from: 0, to: length + 1 } : null;
  }
  if (region.kind === "block") {
    if (line < region.top || line > region.bottom) return null;
    return { from: region.left, to: region.toEnd ? Math.max(length, region.left + 1) : region.right };
  }
  const { start, end } = region;
  if (line < start.line || line > end.line) return null;
  if (line === end.line && end.col === 0 && end.line > start.line) return null;
  const from = line === start.line ? start.col : 0;
  const to = line === end.line ? end.col : length + 1;
  return { from, to: Math.max(to, from + 1) };
}

// Spans for columns start..end, one per run of characters with the same decorations.
function spans(text, decorations, start, end) {
  const cuts = new Set([start, end]);
  for (const { from, to } of decorations) {
    if (from > start && from < end) cuts.add(from);
    if (to > start && to < end) cuts.add(to);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const nodes = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const span = document.createElement("span");
    const classes = decorations.filter((d) => d.from <= from && d.to >= to && d.from < d.to).map((d) => d.cls);
    if (classes.length) span.className = classes.join(" ");
    // Past the end of the line is one blank cell (for the cursor or a selected line break).
    span.textContent = (text.slice(from, Math.min(to, text.length)) + " ".repeat(Math.max(0, to - Math.max(from, text.length)))).replace(/\t/g, "→");
    if (text.slice(from, to).includes("\t")) span.classList.add("pd-tab");
    nodes.push(span);
  }
  return nodes;
}

function selectionSize(vim) {
  if (vim.mode !== "visual" || !vim.visual) return "";
  const { anchor, mode } = vim.visual;
  const lines = Math.abs(vim.cursor.line - anchor.line) + 1;
  if (mode === "line") return String(lines);
  if (mode === "block") return `${lines}x${Math.abs(vim.cursor.col - anchor.col) + 1}`;
  return lines === 1 ? String(Math.abs(vim.cursor.col - anchor.col) + 1) : String(lines);
}

function scrollPosition(vim) {
  const top = vim.view.top;
  const bottom = bottomLine(vim);
  if (top === 0 && bottom >= vim.buf.lastLine) return "All";
  if (top === 0) return "Top";
  if (bottom >= vim.buf.lastLine) return "Bot";
  return `${Math.floor((top * 100) / Math.max(1, vim.buf.lineCount - (bottom - top + 1)))}%`;
}
