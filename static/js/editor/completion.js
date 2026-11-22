// Completion in insert mode: while a trigger character starts a word ("@pri"), a list of
// choices from the host shows under the cursor. It knows nothing about what is completed:
// the host gives sources, { "@": (query) => [item] }. Up/Down move, Enter or Tab takes one,
// Escape closes the list (until the word changes).
//
//   const completion = new Completion(frame, { accept(length, text), onRun() });
//   completion.sources = { "@": (query) => [{ label, detail?, insert } | { label, run(query) }] };
//   completion.update(vim, cursorBox, frameBox)   after every key (closes outside insert mode)
//   completion.onKey(name) -> true when the key was the list's
//
// accept(length, text): put text in place of the length characters before the cursor.
const WORD = "[\\p{L}\\p{N}_'.-]*";

export class Completion {
  constructor(frame, { accept, onRun = () => {} }) {
    this.accept = accept;
    this.onRun = onRun;
    this.sources = {};
    this.items = [];
    this.active = 0;
    this.match = null;
    this.dismissed = null;
    this.list = document.createElement("ul");
    this.list.className = "pd-complete";
    this.list.setAttribute("role", "listbox");
    this.list.hidden = true;
    // The mouse picks without taking the focus from the editor.
    this.list.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const row = event.target.closest?.("[data-index]");
      if (row) this.take(Number(row.dataset.index));
    });
    frame.append(this.list);
  }

  get open() {
    return !this.list.hidden;
  }

  update(vim, cursorBox, frameBox) {
    const match = vim.isInsertLike() ? this.find(vim) : null;
    const key = match && `${match.line}:${match.start}:${match.query}`;
    if (!match || key === this.dismissed) {
      if (!match) this.dismissed = null;
      return this.close();
    }
    this.dismissed = null;
    const items = this.sources[match.trigger](match.query) ?? [];
    if (!items.length) return this.close();
    if (this.match?.query !== match.query || this.match?.line !== match.line) this.active = 0;
    this.match = match;
    this.items = items;
    this.draw(cursorBox(), frameBox);
    return undefined;
  }

  /** The trigger and the word typed after it, ending at the cursor, if any. */
  find(vim) {
    const { line, col } = vim.cursor;
    const before = vim.buf.line(line).slice(0, col);
    for (const trigger of Object.keys(this.sources)) {
      const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const found = new RegExp(`(^|[^\\p{L}\\p{N}_${escaped}.])${escaped}(${WORD})$`, "u").exec(before);
      if (found) return { trigger, query: found[2], line, start: found.index + found[1].length };
    }
    return null;
  }

  draw(box, frameBox) {
    this.list.replaceChildren(...this.items.map((item, index) => {
      const row = document.createElement("li");
      row.className = "pd-complete__item";
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === this.active));
      const label = document.createElement("span");
      label.className = "pd-complete__label";
      label.textContent = item.label;
      row.append(label);
      if (item.detail) {
        const detail = document.createElement("span");
        detail.className = "pd-complete__detail";
        detail.textContent = item.detail;
        row.append(detail);
      }
      return row;
    }));
    this.list.hidden = false;
    if (box) {
      this.list.style.left = `${Math.max(0, box.left - frameBox.left)}px`;
      this.list.style.top = `${box.bottom - frameBox.top + 2}px`;
    }
  }

  onKey(name) {
    const last = this.items.length - 1;
    if (name === "<Down>") this.active = this.active >= last ? 0 : this.active + 1;
    else if (name === "<Up>") this.active = this.active <= 0 ? last : this.active - 1;
    else if (name === "<CR>" || name === "<Tab>") return this.take(this.active), true;
    else if (name === "<Esc>") return this.dismiss(), true;
    else return false;
    for (const row of this.list.children) row.setAttribute("aria-selected", String(Number(row.dataset.index) === this.active));
    return true;
  }

  take(index) {
    const item = this.items[index];
    const match = this.match;
    this.close();
    if (!item || !match) return;
    const length = match.query.length + match.trigger.length;
    if (item.run) {
      Promise.resolve(item.run(match.query)).then((text) => {
        this.onRun();
        if (text) this.accept(length, text);
      }, () => this.onRun());
    } else {
      this.accept(length, item.insert);
    }
  }

  dismiss() {
    if (this.match) this.dismissed = `${this.match.line}:${this.match.start}:${this.match.query}`;
    this.close();
  }

  close() {
    this.list.hidden = true;
    this.match = null;
    this.items = [];
  }
}
