// Completion in insert mode: a list of choices from the host under the cursor. It knows nothing
// about what is completed. Two kinds of source:
//   - trigger sources, { "@": (query) => [item] }: while a trigger character starts a word
//     ("@pri"), the list offers its items;
//   - one context source, (context) => null | { replace, items, head?, foot? }: asked with the
//     cursor's place, { lines, row, col, forced }, when no trigger matches. It says itself
//     whether to open (it may without any trigger); forced is true after Ctrl-Space (force()).
//     replace: how many characters before the cursor a taken item replaces; head and foot:
//     a line over and under the rows.
// Up/Down move, Enter or Tab takes one, Escape closes the list (until the word changes).
//
//   const completion = new Completion(frame, { accept(length, text), onRun() });
//   completion.sources = { "@": (query) => [{ label, detail?, insert } | { label, run(query) }] };
//   completion.context = ({ lines, row, col, forced }) => ...;
//   completion.update(vim, cursorBox, frameBox)   after every key (closes outside insert mode,
//                                                 and at the editor's current ‹blank› unless forced)
//   completion.force(vim, cursorBox, frameBox)    Ctrl-Space: everything for here
//   completion.onKey(name) -> true when the key was the list's
//
// accept(length, text): put text in place of the length characters before the cursor.
const WORD = "[\\p{L}\\p{N}_'.-]*";

export class Completion {
  constructor(frame, { accept, onRun = () => {} }) {
    this.accept = accept;
    this.onRun = onRun;
    this.sources = {};
    this.context = null;
    this.items = [];
    this.active = 0;
    this.match = null;
    this.dismissed = null;
    this.forcedLine = null; // the line Ctrl-Space was pressed on, while its list stays open
    this.box = element("div", "pd-complete");
    this.box.hidden = true;
    this.head = element("div", "pd-complete__head");
    this.list = element("ul", "pd-complete__list");
    this.list.setAttribute("role", "listbox");
    this.foot = element("div", "pd-complete__foot");
    this.box.append(this.head, this.list, this.foot);
    // The mouse picks without taking the focus from the editor.
    this.box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const row = event.target.closest?.("[data-index]");
      if (row) this.take(Number(row.dataset.index));
    });
    frame.append(this.box);
  }

  get open() {
    return !this.box.hidden;
  }

  /** Ctrl-Space: the context source's list for here, with nothing typed too. */
  force(vim, cursorBox, frameBox) {
    if (!vim.isInsertLike() || !this.context) return;
    this.forcedLine = vim.cursor.line;
    this.dismissed = null;
    this.update(vim, cursorBox, frameBox);
  }

  update(vim, cursorBox, frameBox) {
    if (this.forcedLine !== null && this.forcedLine !== vim.cursor.line) this.forcedLine = null;
    // At the current ‹blank› nothing has been typed yet: the list waits for a key (Ctrl-Space
    // still opens it), so Esc, Tab and Enter there are the editor's, not a row's.
    const waiting = this.forcedLine === null && vim.atCurrentBlank?.();
    const found = vim.isInsertLike() && !waiting ? this.find(vim) ?? this.fromContext(vim) : null;
    const key = found && `${found.line}:${found.start}:${found.query}`;
    if (!found || key === this.dismissed) {
      if (!found) this.dismissed = null;
      return this.close();
    }
    this.dismissed = null;
    const items = found.items ?? this.sources[found.trigger](found.query) ?? [];
    if (!items.length) return this.close();
    if (this.match?.query !== found.query || this.match?.line !== found.line) this.active = 0;
    this.match = found;
    this.items = items;
    this.draw(found.head ?? "", found.foot ?? "", cursorBox(), frameBox);
    return undefined;
  }

  /** The trigger and the word typed after it, ending at the cursor, if any. */
  find(vim) {
    const { line, col } = vim.cursor;
    const before = vim.buf.line(line).slice(0, col);
    for (const trigger of Object.keys(this.sources)) {
      const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const found = new RegExp(`(^|[^\\p{L}\\p{N}_${escaped}.])${escaped}(${WORD})$`, "u").exec(before);
      if (found) return { trigger, query: found[2], line, start: found.index + found[1].length, length: found[2].length + trigger.length };
    }
    return null;
  }

  /** The context source's list for the cursor, if it has one. */
  fromContext(vim) {
    if (!this.context) return null;
    const { line, col } = vim.cursor;
    const result = this.context({ lines: vim.buf.lines, row: line, col, forced: this.forcedLine === line });
    if (!result?.items?.length) return null;
    const length = Math.max(0, Math.min(result.replace ?? 0, col));
    const query = vim.buf.line(line).slice(col - length, col);
    return { items: result.items, head: result.head, foot: result.foot, query, line, start: col - length, length };
  }

  draw(head, foot, box, frameBox) {
    this.head.textContent = head;
    this.head.hidden = !head;
    this.foot.textContent = foot;
    this.foot.hidden = !foot;
    // A headed list is a context source's: its rows are snippets, in the mono font.
    this.box.classList.toggle("pd-complete--headed", Boolean(head));
    this.list.replaceChildren(...this.items.map((item, index) => {
      const row = element("li", "pd-complete__item");
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === this.active));
      row.append(element("span", "pd-complete__label", item.label));
      if (item.detail) row.append(element("span", "pd-complete__detail", item.detail));
      return row;
    }));
    this.box.hidden = false;
    if (box) {
      this.box.style.left = `${Math.max(0, box.left - frameBox.left)}px`;
      this.box.style.top = `${box.bottom - frameBox.top + 2}px`;
    }
    this.showActive();
  }

  onKey(name) {
    const last = this.items.length - 1;
    if (name === "<Down>") this.active = this.active >= last ? 0 : this.active + 1;
    else if (name === "<Up>") this.active = this.active <= 0 ? last : this.active - 1;
    else if (name === "<CR>" || name === "<Tab>") return this.take(this.active), true;
    else if (name === "<Esc>") return this.dismiss(), true;
    else return false;
    for (const row of this.list.children) row.setAttribute("aria-selected", String(Number(row.dataset.index) === this.active));
    this.showActive();
    return true;
  }

  showActive() {
    this.list.children[this.active]?.scrollIntoView?.({ block: "nearest" });
  }

  take(index) {
    const item = this.items[index];
    const match = this.match;
    this.close();
    if (!item || !match) return;
    if (item.run) {
      Promise.resolve(item.run(match.query)).then((text) => {
        this.onRun();
        if (text) this.accept(match.length, text);
      }, () => this.onRun());
    } else {
      this.accept(match.length, item.insert);
    }
  }

  dismiss() {
    if (this.match) this.dismissed = `${this.match.line}:${this.match.start}:${this.match.query}`;
    this.close();
  }

  close() {
    this.box.hidden = true;
    this.match = null;
    this.items = [];
    this.forcedLine = null;
  }
}

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
