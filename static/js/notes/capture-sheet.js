// The capture sheet (028; Figma "Note window · capture by key", "Share · meeting capture"):
// docked at the foot of the note window's editor, over its status line (<pd-editor>'s "dock"
// slot), it pushes the text up. \t \q \d open it on a line; it says what will be made and
// where, and saves it with Enter. What it starts from and what it sends are capture-model.js's;
// its keys are capture-sheet-keys.js's.
//
//   const sheet = new CaptureSheet(root, { tree(), today(), onSave(payload), onCancel(), pickHub(choices, state) })
//     root: the docked <section> (hidden while closed)
//     onSave: resolves once made (the host closes the sheet), or throws: the error shows in
//             the sheet, which stays open
//     onCancel: Esc: nothing is made; the host gives the text the focus back
//     pickHub: resolves to the hub picked from choices, or null
//   sheet.open(state)   capture-model.js sheetState(); the focus goes to the Title, caret at the end
//   sheet.close() / sheet.isOpen / sheet.state
import { matchPerson } from "../people/people-model.js";
import { dayText } from "../ui/dates.js";
import { element } from "../ui/dom.js";
import { keyCap } from "../ui/key-hints.js";
import {
  CAPTURE_KINDS, KIND_LABELS, dayRow, fieldsOf, hubChoices, payloadOf, readDay, roleChoices, stepDay, withDay, withHub,
  withKind, withPerson, withRole,
} from "./capture-model.js";
import { sheetAction, sheetHints } from "./capture-sheet-keys.js";

const KIND_KEYS = { task: "t", question: "q", decision: "d" };

export class CaptureSheet {
  constructor(root, { tree, today = () => new Date(), onSave, onCancel, pickHub }) {
    this.root = root;
    this.tree = tree;
    this.today = today;
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.pickHub = pickHub;
    this.state = null;
    this.saving = false;
    this.build();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  build() {
    const root = this.root;
    root.classList.add("capture-sheet");
    root.tabIndex = -1;
    root.setAttribute("aria-label", "Capture");
    this.tabs = element("div", "capture-sheet__tabs");
    this.tabs.setAttribute("role", "tablist");
    this.tabButtons = new Map(CAPTURE_KINDS.map((kind) => {
      const tab = element("button", "capture-sheet__tab");
      tab.type = "button";
      tab.tabIndex = -1;
      tab.setAttribute("role", "tab");
      tab.append(element("span", "", KIND_LABELS[kind]), " ", keyCap(KIND_KEYS[kind]));
      tab.addEventListener("click", () => this.update(withKind(this.state, kind)));
      this.tabs.append(tab);
      return [kind, tab];
    }));

    this.title = input("capture-sheet__input capture-sheet__title", "Title");
    this.whoAvatar = element("span", "capture-sheet__avatar");
    this.whoAvatar.setAttribute("aria-hidden", "true");
    this.who = input("capture-sheet__input capture-sheet__who", "Who");
    this.who.placeholder = "type a name";
    this.whoNote = element("span", "capture-sheet__note");
    this.roles = element("div", "capture-sheet__roles");
    this.roles.setAttribute("role", "radiogroup");
    this.roles.setAttribute("aria-label", "Who does it");
    this.dayLabel = element("span", "capture-sheet__label");
    this.day = input("capture-sheet__input capture-sheet__day", "Day");
    this.dayNote = element("span", "capture-sheet__note");
    this.hub = element("button", "capture-sheet__hub");
    this.hub.type = "button";
    this.hub.addEventListener("click", () => this.chooseHub());

    this.rows = {
      title: row("Title", this.title),
      who: row("Who", this.whoAvatar, this.who, this.whoNote),
      role: row("Role", this.roles),
      day: row("", this.day, this.dayNote),
      hub: row("Goes to", this.hub),
    };
    this.rows.day.firstChild.replaceWith(this.dayLabel);
    this.error = element("p", "capture-sheet__error");
    this.error.setAttribute("role", "alert");
    this.save = element("button", "capture-sheet__save");
    this.save.type = "button";
    this.save.tabIndex = -1;
    this.save.addEventListener("click", () => this.submit());
    const caps = element("div", "capture-sheet__keys");
    caps.replaceChildren(...sheetHints().map(({ cap, words }) => {
      const hint = element("span", "capture-sheet__hint");
      hint.append(keyCap(cap), " ", words);
      return hint;
    }));
    const foot = element("div", "capture-sheet__foot");
    foot.append(caps, this.save);
    const fields = element("div", "capture-sheet__fields");
    fields.append(...Object.values(this.rows));
    root.replaceChildren(this.tabs, fields, this.error, foot);
    root.hidden = true;

    this.title.addEventListener("input", () => {
      this.error.textContent = "";
      this.state = { ...this.state, title: this.title.value };
    });
    this.who.addEventListener("input", () => this.typedWho());
    this.day.addEventListener("input", () => this.typedDay());
    root.addEventListener("keydown", (event) => this.onKey(event));
    // The sheet sits inside <pd-editor> (its dock slot): its fields' native change and input
    // events must not reach the editor's listeners, which read them as the text changing.
    for (const type of ["change", "input"]) root.addEventListener(type, (event) => event.stopPropagation());
  }

  open(state) {
    this.state = state;
    this.dayTyped = false;
    this.root.hidden = false;
    this.error.textContent = "";
    this.title.value = state.title;
    this.who.value = state.person?.title ?? "";
    this.draw();
    this.title.focus({ preventScroll: true });
    this.title.setSelectionRange(this.title.value.length, this.title.value.length);
  }

  close() {
    this.root.hidden = true;
    this.state = null;
    this.saving = false;
  }

  /** typing: the day came from the day field, so its text stays as typed (not redrawn). */
  update(state, { typing = false } = {}) {
    if (!state || state === this.state) return;
    // A failed save's error is about the sheet as it was: any change makes it stale.
    this.error.textContent = "";
    const before = this.state;
    this.state = state;
    const moved = dayRow(before)?.day !== dayRow(state)?.day || dayRow(before)?.label !== dayRow(state)?.label;
    if (moved && !typing) this.dayTyped = false;
    this.draw();
  }

  /** Who the typed name means: one person, or none while it is empty or matches no one. */
  typedWho() {
    const text = this.who.value.trim();
    const { person, matches } = text ? matchPerson(this.tree(), text) : { person: null, matches: [] };
    const next = person?.id === this.state.person?.id ? { ...this.state, found: false } : withPerson(this.state, person);
    this.whoMatches = text && !person ? matches.length : 0;
    this.update(next);
  }

  typedDay() {
    this.error.textContent = "";
    this.dayTyped = true;
    const day = readDay(this.day.value, this.today());
    this.dayBad = day === undefined;
    if (!this.dayBad) this.update(withDay(this.state, day), { typing: true });
    this.drawDayNote();
  }

  draw() {
    const state = this.state;
    if (!state) return;
    this.root.dataset.kind = state.kind;
    for (const [kind, tab] of this.tabButtons) {
      tab.setAttribute("aria-selected", String(kind === state.kind));
      tab.classList.toggle("capture-sheet__tab--on", kind === state.kind);
    }
    const fields = fieldsOf(state);
    for (const [name, node] of Object.entries(this.rows)) node.hidden = !fields.includes(name);
    this.drawWho();
    this.drawRoles();
    this.drawDay();
    const nearest = state.hubId === state.nearestHubId ? ` (this ${state.meeting ? "meeting" : "note"}'s hub)` : "";
    this.hub.textContent = `${state.hubTitle}${nearest} ▾`;
    this.hub.title = "Pick another hub (Space)";
    this.save.textContent = `Save ${state.kind}`;
  }

  drawWho() {
    const { person, found } = this.state;
    this.whoAvatar.textContent = person ? initials(person.title) : "";
    this.whoAvatar.hidden = !person;
    if (document.activeElement !== this.who) this.who.value = person?.title ?? this.who.value;
    this.whoNote.textContent = found ? "found in the line" : person ? ""
      : this.whoMatches > 1 ? `${this.whoMatches} people match: type more` : this.who.value.trim() ? "no one by that name" : "";
  }

  drawRoles() {
    const choices = roleChoices(this.state);
    const focused = this.roles.contains(document.activeElement);
    this.roles.replaceChildren(...choices.map((choice) => {
      const on = choice.role === this.state.role;
      const node = element("button", `capture-sheet__role${on ? " capture-sheet__role--on" : ""}`, choice.label);
      node.type = "button";
      node.tabIndex = on ? 0 : -1;
      node.dataset.role = choice.role;
      node.setAttribute("role", "radio");
      node.setAttribute("aria-checked", String(on));
      node.addEventListener("click", () => {
        this.update(withRole(this.state, choice.role));
        this.focusField("role");
      });
      return node;
    }));
    if (focused) this.focusField("role");
  }

  drawDay() {
    const row = dayRow(this.state);
    if (!row) return;
    this.dayLabel.textContent = row.label;
    if (!this.dayTyped) this.day.value = row.day ? dayText(row.day, { today: this.today() }) : "";
    this.day.placeholder = "none";
    this.drawDayNote();
  }

  drawDayNote() {
    const row = dayRow(this.state);
    if (!row) return;
    this.dayNote.textContent = this.dayTyped && this.dayBad ? "not a day: fri, tomorrow, 2026-12-04"
      : this.dayTyped ? (row.day ? dayText(row.day, { today: this.today() }) : "none") : row.note;
    this.dayNote.classList.toggle("capture-sheet__note--bad", Boolean(this.dayTyped && this.dayBad));
  }

  // ---- keys ----------------------------------------------------------------------------

  fieldOf(node) {
    if (node === this.title) return "title";
    if (node === this.who) return "who";
    if (this.roles.contains(node)) return "role";
    if (node === this.day) return "day";
    if (node === this.hub) return "hub";
    return null;
  }

  /** select: the field's text is selected, so what is typed replaces it (Who and the day). */
  focusField(name, { select = false } = {}) {
    const node = name === "role" ? this.roles.querySelector("[aria-checked=\"true\"]") ?? this.roles.firstChild
      : { title: this.title, who: this.who, day: this.day, hub: this.hub }[name];
    node?.focus({ preventScroll: true });
    if (select && (node === this.who || node === this.day)) node.select();
  }

  onKey(event) {
    if (!this.state || event.isComposing) return;
    const field = this.fieldOf(document.activeElement);
    // A typed day that is not empty is a date being written: its - is a hyphen, not a day earlier.
    const typing = field === "day" && this.dayTyped && this.day.value.trim() !== "";
    const action = sheetAction(event, { field, text: document.activeElement instanceof HTMLInputElement, typing });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.run(action, field);
  }

  run(action, field) {
    const fields = fieldsOf(this.state);
    const index = fields.indexOf(field);
    if (action === "save") this.submit();
    else if (action === "cancel") this.onCancel();
    else if (action === "next" || action === "previous") {
      // From the sheet itself (no field), Tab goes to the first field and S-Tab to the last.
      const to = index < 0 ? (action === "next" ? 0 : fields.length - 1)
        : (index + (action === "next" ? 1 : -1) + fields.length) % fields.length;
      this.focusField(fields[to], { select: true });
    } else if (CAPTURE_KINDS.includes(action)) {
      this.update(withKind(this.state, action));
      // Its field gone (the role or the day of a task), the focus waits on the sheet, not in the
      // Title, so the next t q d still switches the kind instead of typing.
      if (!fieldsOf(this.state).includes(field)) this.root.focus({ preventScroll: true });
    } else if (action === "rolePrevious" || action === "roleNext") {
      const choices = roleChoices(this.state);
      const index = choices.findIndex((choice) => choice.role === this.state.role);
      const next = choices[(index + (action === "roleNext" ? 1 : -1) + choices.length) % choices.length];
      if (next) this.update(withRole(this.state, next.role));
      this.focusField("role");
    } else if (action === "dayLater" || action === "dayEarlier") {
      this.dayTyped = false;
      this.update(withDay(this.state, stepDay(dayRow(this.state)?.day, action === "dayLater" ? 1 : -1, this.today())));
      this.draw();
      // What is typed next replaces the stepped day rather than adding to it.
      this.day.select();
    }
  }

  async chooseHub() {
    const hub = await this.pickHub(hubChoices(this.tree(), this.state.sourceId), this.state);
    if (this.state && hub) this.update(withHub(this.state, hub));
    if (this.state) this.focusField("hub");
  }

  async submit() {
    if (this.saving || !this.state) return;
    if (!this.state.title.trim()) return this.fail("E: the title is empty");
    if (this.dayTyped && this.dayBad) return this.fail(`E: not a day: "${this.day.value.trim()}"`);
    this.saving = true;
    this.error.textContent = "";
    try {
      await this.onSave(payloadOf(this.state));
    } catch (error) {
      this.fail(error?.message ?? String(error));
    } finally {
      this.saving = false;
    }
    return undefined;
  }

  fail(text) {
    this.error.textContent = /^E\d*:/.test(text) ? text : `E: ${text}`;
  }
}

function input(className, label) {
  const node = element("input", className);
  Object.assign(node, { type: "text", autocomplete: "off", spellcheck: false });
  node.setAttribute("aria-label", label);
  return node;
}

function row(label, ...parts) {
  const node = element("div", "capture-sheet__row");
  const value = element("div", "capture-sheet__value");
  value.append(...parts);
  node.append(element("span", "capture-sheet__label", label), value);
  return node;
}

function initials(name) {
  return String(name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
}
