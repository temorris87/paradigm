// The Settings page (&settings, the main window; the gear, g , and :settings open it): the
// index of its sections on the left, one card per section on the right, scrolling as one page
// (settings-model.js says which, in order). The Note window card picks where the note window
// opens (windows/note-window.js); Codes and hours, Holidays and Time off are the timesheet's
// (timesheet/time-settings.js); Linked folders are the app's /api/files, each unlinked as the
// Files section does (files/file-commands.js); the Data folder comes from /api/about.
// Its keys: settings-keys.js.
//
//   const page = new SettingsPage(section, { app: () => notesApp, changes, timeApi, aboutApi, onLeave() });
//   page.enter()        it comes into view: the timesheet settings and the data folder are read
//   page.show(ctx)      every redraw: ctx.files and ctx.tree for the linked folders
//   page.focus()
import { unlinkFolderDialog } from "../files/file-commands.js";
import { element, focusFirstKey, focusedKey, keysAfterRemoving } from "../ui/dom.js";
import { TimeSettings } from "../timesheet/time-settings.js";
import { WINDOW_MODES, setWindowMode, windowMode } from "../windows/note-window.js";
import { NO_FOLDERS, SETTINGS_SECTIONS, linkedFolderRows, litSection, windowChoices } from "./settings-model.js";
import { settingsAction } from "./settings-keys.js";

export class SettingsPage {
  constructor(section, { app, changes, timeApi, aboutApi, onLeave }) {
    this.section = section;
    this.app = app;
    this.changes = changes;
    this.aboutApi = aboutApi;
    this.picked = null;
    this.lit = null;
    section.classList.add("settings");
    section.tabIndex = -1;
    this.time = new TimeSettings({
      api: timeApi,
      run: (promise) => this.run(promise),
      say: (text) => this.app().say(text),
      // The Week, Today and the note window read the hours again.
      onChanged: () => {
        changes?.send({ type: "changed", what: ["time"] });
        this.run(this.app().refreshTree());
      },
    });
    this.build();
    section.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || settingsAction(event) !== "leave") return;
      event.preventDefault();
      onLeave();
    });
  }

  build() {
    const title = element("h1", "settings__title", "Settings");
    this.index = element("nav", "settings__index");
    this.index.setAttribute("aria-label", "Sections");
    const list = element("ul", "settings__entries");
    this.entries = new Map();
    this.cards = new Map();
    this.scroller = element("div", "settings__cards");
    for (const { key, label } of SETTINGS_SECTIONS) {
      const entry = element("button", "settings__entry", label);
      entry.type = "button";
      entry.addEventListener("click", () => this.scrollToCard(key));
      const item = element("li", "");
      item.append(entry);
      list.append(item);
      this.entries.set(key, entry);
      const card = element("section", "settings-card");
      card.id = `settings-${key}`;
      const heading = element("h2", "settings-card__title", label);
      heading.id = `settings-${key}-title`;
      card.setAttribute("aria-labelledby", heading.id);
      const body = element("div", "settings-card__body");
      card.append(heading, body);
      this.cards.set(key, { card, body });
      this.scroller.append(card);
    }
    this.index.append(list);
    this.cards.get("hours").body.append(this.time.nodes.hours);
    this.cards.get("holidays").body.append(this.time.nodes.holidays);
    this.cards.get("timeoff").body.append(this.time.nodes.timeOff);
    this.drawWindowChoices();
    this.scroller.addEventListener("scroll", () => this.updateLit(), { passive: true });
    const layout = element("div", "settings__layout");
    layout.append(this.index, this.scroller);
    this.section.replaceChildren(title, layout);
    this.updateLit();
  }

  enter() {
    this.drawWindowChoices();
    this.run(this.time.load());
    this.run(this.loadAbout());
    requestAnimationFrame(() => this.updateLit());
  }

  show(ctx) {
    this.drawFolders(ctx);
  }

  focus() {
    this.section.focus({ preventScroll: true });
  }

  // ---- the index ----------------------------------------------------------------------

  scrollToCard(key) {
    const { card } = this.cards.get(key);
    this.picked = key;
    this.scroller.scrollTop = card.offsetTop - this.firstTop();
    this.updateLit();
  }

  firstTop() {
    return this.cards.get(SETTINGS_SECTIONS[0].key).card.offsetTop;
  }

  /** Lights the index entry of the card at the top of the scroller. */
  updateLit() {
    const base = this.firstTop() + this.scroller.scrollTop;
    const tops = SETTINGS_SECTIONS.map(({ key }) => ({ key, top: this.cards.get(key).card.offsetTop - base }));
    const atEnd = this.scroller.scrollTop + this.scroller.clientHeight >= this.scroller.scrollHeight - 2;
    const lit = litSection(tops, { picked: this.picked, atEnd });
    if (!atEnd) this.picked = null;
    if (lit === this.lit) return;
    this.lit = lit;
    for (const [key, entry] of this.entries) {
      if (key === lit) entry.setAttribute("aria-current", "true");
      else entry.removeAttribute("aria-current");
    }
  }

  // ---- the cards ----------------------------------------------------------------------

  drawWindowChoices() {
    const group = element("div", "settings-choices");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", "settings-window-title");
    for (const choice of windowChoices(WINDOW_MODES, windowMode())) {
      const label = element("label", "settings-choice");
      const input = element("input", "settings-choice__input");
      Object.assign(input, { type: "radio", name: "settings-note-window", value: choice.key, checked: choice.checked });
      input.addEventListener("change", () => input.checked && this.pickWindowMode(choice));
      const words = element("span", "settings-choice__words");
      words.append(element("span", "settings-choice__label", choice.label), element("span", "settings-choice__help", choice.help));
      label.append(input, words);
      group.append(label);
    }
    this.cards.get("window").body.replaceChildren(group);
  }

  /** Saved at once; an open note window moves to the right third now, as the menu did. */
  pickWindowMode({ key, label, help }) {
    setWindowMode(key);
    if (key === "split") {
      this.changes?.send({ type: "place", to: "note", mode: "split" });
      this.app().say(`Note window: ${label} (${help}). An open note window moves there now.`);
    } else {
      this.app().say(`Note window: ${label} (${help}). Close the note window for it to open there next time.`);
    }
  }

  /** Drawn on every redraw (the unlink dialog reads the tree again before it opens), so the
   * focus stays on the button it was on. */
  drawFolders(ctx) {
    const rows = linkedFolderRows(ctx?.files?.allFolders() ?? [], ctx?.tree);
    const body = this.cards.get("folders").body;
    const kept = focusedKey(body);
    if (!rows.length) {
      body.replaceChildren(element("p", "time-note", NO_FOLDERS));
      return;
    }
    const unlinkKeys = rows.map((row) => `folder-unlink-${row.id}`);
    const list = element("ul", "settings-folders");
    list.append(...rows.map((row, index) => {
      const item = element("li", "settings-folder");
      const hub = button(row.hubTitle, `Open "${row.hubTitle}"`, () => this.app().guard(this.app().open(row.hubId)),
        "settings-folder__hub");
      hub.dataset.focusKey = `folder-hub-${row.id}`;
      const path = element("span", "settings-folder__path", row.path || row.name);
      path.title = row.path;
      const unlink = button("Unlink…", `Unlink "${row.name}" from "${row.hubTitle}"`, () => {
        // Cancelled, the dialog puts the focus back itself; unlinked, the row is gone with its
        // button, so the row now in its place (or the card) takes it.
        const after = keysAfterRemoving(unlinkKeys, index);
        this.app().guard(unlinkFolderDialog(this.app(), row.id).then((done) => done && this.focusFolders(after)));
      }, "time-button time-button--small settings-folder__unlink");
      unlink.dataset.focusKey = unlinkKeys[index];
      item.append(hub, path, unlink);
      return item;
    }));
    body.replaceChildren(list);
    if (kept) focusFirstKey(body, [kept]);
  }

  focusFolders(keys) {
    const { card, body } = this.cards.get("folders");
    if (focusFirstKey(body, keys)) return;
    card.tabIndex = -1;
    card.focus();
  }

  async loadAbout() {
    const body = this.cards.get("data").body;
    let about;
    try {
      about = await this.aboutApi.get();
    } catch (error) {
      body.replaceChildren(element("p", "time-note", `Can't read the data folder: ${error?.message ?? error}`));
      return;
    }
    const folder = about?.data_folder ?? "";
    const line = element("div", "settings-data");
    const path = element("code", "settings-data__path", folder);
    const copy = button("Copy path", "Copy the data folder's path", () => this.run(copyPath(folder).then(() => this.app().say("Data folder path copied"))),
      "time-button settings-data__copy");
    line.append(path, copy);
    const parts = [element("p", "time-note", "Where Paradigm keeps its notes."), line];
    if (about?.version) parts.push(element("p", "time-note", `Version ${about.version}`));
    body.replaceChildren(...parts);
  }

  run(promise) {
    Promise.resolve(promise).catch((error) => this.app().say(error?.message ?? String(error), { error: true }));
  }
}

function copyPath(text, clipboard = navigator.clipboard) {
  if (!clipboard?.writeText) return Promise.reject(new Error("E: the browser can't copy here"));
  return clipboard.writeText(text);
}

function button(text, title, onClick, className) {
  const node = element("button", className, text);
  Object.assign(node, { type: "button", title });
  node.addEventListener("click", onClick);
  return node;
}
