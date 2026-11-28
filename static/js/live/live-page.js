// The Live page (&live, the main window): the note open in the note window, rendered as on a
// dashboard while it is typed, with a caret where the cursor is, so a screen share of this
// window shows where the typing is. The note window sends what it shows (live-sender.js) on
// the windows' channel (messages with a task are a task's notes: not this page's):
// { type: "live", id, title, kind, crumbs, fields: [{ name, label,
// text, highlights }], active, line, col, mode, trashed, captures, reply? } (reply: the
// answer to "live-ask"; captures: what was captured from it, notes/capture-model.js), and
// "live-closed" when it goes: unless a new "live" comes within RELOAD_GRACE_MS (a reload), the
// page asks to leave (onClosed; the app shows the page under Live again). A meeting gets the card "Agreed in this meeting" beside its
// Agenda and Notes (agreed-card.js).
//
//   const live = new LivePage(section, { changes, app, viewer, onNewNote, onClosed, ready, timers })
//     app()            the NotesApp (its tree, renderer options, open)
//     viewer           <pd-image-viewer>: a click on an image opens it
//     onNewNote(id)    the note window opened another note: the main window switches here
//     onClosed()       the note window closed (and did not come back): leave Live if shown
//     timers           { setTimeout, clearTimeout }: the reload's grace (tests pass fakes)
//     ready()          a promise for the app's start, or null: a new note waits for it, or
//                      the start's own page (from the URL) would replace the Live page
//   live.show() / live.focus()     a page of PageViews (notes/page-views.js)
//   live.receive(message)          a message from the channel
//
// Each top-level block is its own node, kept while its HTML stays the same, so a keystroke
// draws only the block it changed: maths and diagrams elsewhere are not drawn again.
import { syncDiagramSheets } from "../diagrams/insert-svg.js";
import { parseMarkdown, renderBlocks } from "../markdown/index.js";
import { recentIds } from "../palette/recent.js";
import { drawRendered, followNoteLinks } from "../ui/rendered-text.js";
import { CARET, placeCaret } from "./caret.js";
import { AgreedCard } from "./agreed-card.js";
import { markHighlights } from "./highlights.js";
import { RELOAD_GRACE_MS } from "./live-return.js";

// Ids on this page start so, then the field's name ("live-agenda-", "live-body-"), apart
// from the dashboard's text under it and from each other: a meeting's Agenda and Notes may
// both have a "## Actions" or a [^1].
const ID_PREFIX = "live-";
// The sentinel in a URL, percent-encoded by the renderer.
const ENCODED_CARET = /%EE%80%80/i;

export class LivePage {
  constructor(section, { changes = null, app, viewer = null, onNewNote = () => {}, onClosed = () => {}, ready = () => null,
    timers = globalThis }) {
    this.section = section;
    this.app = app;
    this.viewer = viewer;
    this.onNewNote = onNewNote;
    this.onClosed = onClosed;
    this.timers = timers;
    this.closing = null; // the grace timer after "live-closed"
    this.ready = ready;
    this.state = null;
    this.closed = false;
    this.fields = new Map(); // field name -> { root, label, body, nodes: html key -> [node] }
    this.build();
    changes?.listen((message) => this.receive(message));
    changes?.send({ type: "live-ask" });
  }

  build() {
    const section = this.section;
    section.tabIndex = -1;
    this.head = element("header", "live__head");
    this.crumbs = element("div", "live__crumbs");
    this.title = element("h1", "live__title");
    this.stateLine = element("p", "live__state", "The note window is closed");
    this.head.append(this.crumbs, this.title, this.stateLine);
    this.body = element("div", "live__body");
    this.fieldsBox = element("div", "live__fields");
    this.agreed = new AgreedCard({
      onOpenTask: (id) => this.app().guard(this.app().showTask(id)),
      onOpenNote: (id) => this.openNote(id),
    });
    this.body.append(this.fieldsBox, this.agreed.root);
    this.note = element("p", "live__note");
    this.empty = element("div", "live__empty");
    const open = element("button", "live__open", "Open note window");
    open.type = "button";
    open.addEventListener("click", () => this.openNoteWindow());
    this.empty.append(element("p", "live__note", "No note open in the note window."), open);
    section.replaceChildren(this.head, this.note, this.body, this.empty);
    followNoteLinks(this.body, (id) => this.openNote(id));
    this.body.addEventListener("click", (event) => this.onClick(event));
  }

  receive(message) {
    // A task's notes in the note window are the task page's (tasks/task-notes-live.js).
    if (message.task !== undefined) return;
    if (message.type === "live") {
      // The answer to live-ask (reply) shows what was open already: no note was just opened.
      const fresh = !message.reply && !message.trashed && message.id !== this.state?.id;
      this.state = message;
      this.closed = false;
      this.cancelClosing();
      if (fresh) this.announce(message.id);
      this.draw();
    } else if (message.type === "live-closed") {
      this.closed = true;
      this.draw();
      this.cancelClosing();
      this.closing = this.timers.setTimeout(() => {
        this.closing = null;
        if (this.closed) this.onClosed();
      }, RELOAD_GRACE_MS);
    }
  }

  cancelClosing() {
    if (this.closing === null) return;
    this.timers.clearTimeout(this.closing);
    this.closing = null;
  }

  show() {
    this.draw();
  }

  announce(id) {
    const ready = this.ready();
    if (!ready) {
      this.onNewNote(id);
      return;
    }
    const go = () => this.onNewNote(id);
    ready.then(go, go);
  }

  focus() {
    this.section.focus({ preventScroll: true });
  }

  draw() {
    if (this.section.hidden) return;
    const state = this.state;
    this.empty.hidden = Boolean(state);
    this.head.hidden = !state;
    if (!state) {
      this.note.hidden = true;
      this.body.hidden = true;
      return;
    }
    this.crumbs.textContent = (state.crumbs ?? []).join(" › ");
    this.title.textContent = state.title ?? "";
    this.stateLine.hidden = !this.closed;
    const fields = state.fields ?? [];
    const blank = !fields.some((field) => String(field.text ?? "").trim());
    const message = state.trashed ? "Moved to trash" : blank ? "Empty note" : "";
    this.note.hidden = !message;
    this.note.textContent = message;
    this.body.hidden = Boolean(message);
    if (message) {
      this.dropFields(new Set());
      return;
    }
    this.dropFields(new Set(fields.map((field) => field.name)));
    const views = fields.map((field) => this.drawField(field, state));
    this.fieldsBox.replaceChildren(...views.map((view) => view.root));
    this.drawAgreed(state);
    syncDiagramSheets(document); // sheets of diagrams gone with their blocks go too
    this.scrollToCaret();
  }

  /** A meeting's card of what was agreed: right of its Agenda and Notes (stacked when narrow). */
  drawAgreed(state) {
    const meeting = state.kind === "meeting";
    this.body.classList.toggle("live__body--meeting", meeting);
    this.agreed.root.hidden = !meeting;
    if (meeting) this.agreed.show(state.captures ?? [], this.app().today?.() ?? new Date());
  }

  dropFields(keep) {
    for (const name of [...this.fields.keys()]) if (!keep.has(name)) this.fields.delete(name);
  }

  fieldView(field) {
    let view = this.fields.get(field.name);
    if (!view) {
      const root = element("section", "live-field");
      root.dataset.field = field.name;
      const label = element("div", "live-field__label");
      const body = element("div", "live-field__body md-doc");
      root.append(label, body);
      view = { root, label, body, nodes: new Map() };
      this.fields.set(field.name, view);
    }
    view.highlights = field.highlights ?? [];
    return view;
  }

  drawField(field, state) {
    const view = this.fieldView(field);
    view.label.textContent = field.label ?? "";
    view.label.hidden = !field.label;
    const active = field.name === state.active;
    const caret = active ? placeCaret(field.text ?? "", state.line ?? 0, state.col ?? 0, state.mode) : null;
    const { blocks, footnotes } = renderBlocks(parseMarkdown(caret ? caret.text : field.text ?? ""), this.options(state.id, field.name));
    const marks = JSON.stringify(view.highlights.map(({ text, label, title, capture }) => [text, label, title, capture]));
    const pieces = blocks.filter((block) => block.html).map((block) => ({ ...block, key: blockKey(block.html, marks, caret) }));
    if (footnotes) pieces.push({ html: footnotes, key: blockKey(footnotes, marks, caret), footnotes: true });
    // Blocks whose HTML did not change keep their node; maths drawn in the others is reused.
    const previous = view.nodes;
    const next = new Map();
    for (const piece of pieces) piece.node = previous.get(piece.key)?.shift() ?? null;
    const drawn = drawnMath([...previous.values()].flat());
    for (const piece of pieces) {
      piece.node ??= this.blockNode(piece.html, view.highlights, caret?.shape ?? "block", drawn);
      if (!next.has(piece.key)) next.set(piece.key, []);
      next.get(piece.key).push(piece.node);
      const holdsCursor = active && !piece.footnotes && caret.line >= piece.startLine && caret.line <= piece.endLine;
      piece.node.classList.toggle("live-block--cursor", holdsCursor);
    }
    view.nodes = next;
    const nodes = pieces.map((piece) => piece.node);
    const gap = active && !caret.placed ? blankLineGap(pieces, caret) : null;
    if (gap) nodes.splice(gap.at, 0, gap.node);
    view.body.replaceChildren(...nodes);
    return view;
  }

  blockNode(html, highlights, shape, drawn) {
    const node = element("div", "live-block");
    node.innerHTML = html;
    for (const link of node.querySelectorAll("a[href]")) {
      // Anything but a "#" jump opens in a new tab, never in place of the app.
      if (!link.getAttribute("href").startsWith("#")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }
    const caret = swapCaret(node, shape);
    reuseMath(node, drawn);
    drawRendered(node);
    if (highlights.length) markHighlights(node, highlights);
    if (caret && shape === "block") coverNextCharacter(caret);
    return node;
  }

  /** Keeps the caret (or the cursor's block) inside the middle third of the view. */
  scrollToCaret() {
    const target = this.body.querySelector(".live-caret") ?? this.body.querySelector(".live-block--cursor");
    if (!target) return;
    const scroller = scrollParent(this.section);
    const view = scroller === document.scrollingElement ? { top: 0, height: window.innerHeight }
      : { top: scroller.getBoundingClientRect().top, height: scroller.clientHeight };
    const box = target.getBoundingClientRect();
    const third = view.height / 3;
    const top = box.top - view.top;
    const bottom = Math.min(box.bottom - view.top, top + third);
    if (top < third) scroller.scrollTop -= third - top;
    else if (bottom > 2 * third) scroller.scrollTop += bottom - 2 * third;
  }

  options(fromId, fieldName) {
    return { ...this.app().markdownOptions(fromId), idPrefix: `${ID_PREFIX}${fieldName}-` };
  }

  onClick(event) {
    const mark = event.target.closest?.("[data-highlight]");
    if (mark) {
      const view = this.fields.get(mark.closest(".live-field")?.dataset.field);
      const data = view?.highlights[Number(mark.dataset.highlight)]?.data ?? null;
      if (data !== null) this.openNote(data);
      return;
    }
    const image = event.target.closest?.("img");
    if (image && !image.closest("a") && this.viewer) {
      event.preventDefault();
      this.viewer.open({ src: image.src, alt: image.alt });
    }
  }

  openNote(id) {
    const app = this.app();
    app.guard(app.open(id));
  }

  /** The empty page's button: the note window, on the note opened last that still exists. */
  openNoteWindow() {
    const app = this.app();
    const id = [...recentIds(), app.currentId].find((each) => each !== null && app.tree.has(each));
    try {
      if (id === undefined) throw new Error("E: no note to open yet: make one first");
      app.openInNoteWindow(id);
    } catch (error) {
      app.fail(error);
    }
  }
}

// A block's node is reused while its HTML, the highlights and (when the caret is in it) the
// caret's shape stay the same.
function blockKey(html, marks, caret) {
  return `${html.includes(CARET) ? caret?.shape ?? "" : ""}\u0000${marks}\u0000${html}`;
}

/**
 * The sentinel becomes the caret in text, and goes from every attribute (an href, an id).
 * Returns the caret element, or null when the sentinel landed nowhere it could show.
 */
export function swapCaret(node, shape) {
  for (const each of [node, ...node.querySelectorAll("*")]) {
    for (const attribute of [...each.attributes]) {
      if (attribute.value.includes(CARET) || ENCODED_CARET.test(attribute.value)) {
        each.setAttribute(attribute.name, attribute.value.split(CARET).join("").replace(new RegExp(ENCODED_CARET, "gi"), ""));
      }
    }
  }
  let caret = null;
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) if (text.data.includes(CARET)) texts.push(text);
  for (const text of texts) {
    const at = text.data.indexOf(CARET);
    // Maths and diagrams are drawn from their text; a sentinel there would be drawn too.
    if (caret || text.parentElement?.closest(".md-math, .md-mermaid")) {
      text.data = text.data.split(CARET).join("");
      continue;
    }
    const after = text.splitText(at);
    after.data = after.data.slice(1).split(CARET).join("");
    caret = node.ownerDocument.createElement("span");
    caret.className = `live-caret live-caret--${shape}`;
    caret.setAttribute("aria-hidden", "true");
    text.after(caret);
  }
  return caret;
}

/**
 * The cursor on a blank line no block holds (a new line after `o`, the gap between two
 * paragraphs): a line of its own with the band and an empty caret, before the first block
 * that starts after it, so the place still shows. Not kept between draws: it is one span.
 * Returns { at, node } (at: its place among the blocks), or null when a block holds it.
 */
function blankLineGap(pieces, caret) {
  const blocks = pieces.filter((piece) => !piece.footnotes);
  if (blocks.some((piece) => caret.line >= piece.startLine && caret.line <= piece.endLine)) return null;
  const after = blocks.findIndex((piece) => piece.startLine > caret.line);
  const node = element("div", "live-block live-block--cursor live-gap");
  const mark = element("span", `live-caret live-caret--${caret.shape} live-caret--empty`);
  mark.setAttribute("aria-hidden", "true");
  node.append(mark);
  return { at: after < 0 ? blocks.length : pieces.indexOf(blocks[after]), node };
}

/**
 * Normal mode's block caret covers the character it is on: the next one in the text.
 * Highlights split the text around the caret: they leave empty text nodes beside it and wrap
 * the character in a span. So empty nodes are skipped, and a character at the start of the
 * element beside it counts as beside it.
 */
export function coverNextCharacter(caret) {
  let next = caret.nextSibling;
  while (next && next.nodeType === Node.TEXT_NODE && !next.data) next = next.nextSibling;
  const text = next ? leadingText(next) : null;
  // Only a character right beside the caret: one in a later line or block is not under it.
  if (!text || text.data[0] === "\n") {
    caret.classList.add("live-caret--empty");
    return;
  }
  // The character may start an element (a link's text, bold, a highlight): the caret goes in
  // with it, so the element keeps its text (a link stays clickable, bold stays bold).
  if (text.parentNode !== caret.parentNode) text.before(caret);
  const char = String.fromCodePoint(text.data.codePointAt(0));
  text.data = text.data.slice(char.length);
  if (!text.data) text.remove();
  caret.textContent = char;
}

/** The first non-empty text a node starts with, or null when it starts with no text (a
 * line break, a badge, maths). */
function leadingText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.data ? node : null;
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches("[data-badge], .md-math, .md-mermaid, br")) return null;
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && !child.data) continue;
    return leadingText(child);
  }
  return null;
}

/** Maths already drawn in nodes going away, by its source: tag + TeX -> [elements]. */
function drawnMath(nodes) {
  const found = new Map();
  for (const node of nodes) {
    for (const math of node.querySelectorAll(".md-math[data-tex]")) {
      const key = `${math.tagName}\u0000${math.className}\u0000${math.dataset.tex}`;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push(math);
    }
  }
  return found;
}

function reuseMath(node, drawn) {
  for (const placeholder of node.querySelectorAll(".md-math:not([data-tex])")) {
    const key = `${placeholder.tagName}\u0000${placeholder.className}\u0000${placeholder.textContent}`;
    const old = drawn.get(key)?.shift();
    if (old) placeholder.replaceWith(old);
  }
}

function scrollParent(node) {
  for (let at = node; at && at !== document.body; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && at.scrollHeight > at.clientHeight) return at;
  }
  return document.scrollingElement;
}

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
