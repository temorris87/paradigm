// The palette (Tyson's "go to or run", 2026-11-22): one text box over Recent and Pages, notes
// as you type, and every command after ":" with its key (palette-model.js reads them from
// the command and key tables). It replaces the Go to picker. Enter opens or runs; Shift-Enter
// opens a note in the note window; Tab completes a command's name. Its keys are the
// "palette" scope of ui/ui-keys.js.
//
//   openPalette(app, query = "")      app: the NotesApp; resolves when it closes
import { goToItems, whereText } from "../notes/note-actions.js";
import { NOTE_COMMANDS, runNoteCommand } from "../notes/commands.js";
import { HUB_KEYS } from "../hubs/hub-keys.js";
import { MAIN_KEYS } from "../layout/main-keys.js";
import { TODAY_KEYS } from "../today/today-keys.js";
import { element, openModal, restoreFocus, uniqueId } from "../ui/dom.js";
import { uiAction, uiHints } from "../ui/ui-keys.js";
import { commandKeys, findCommand, parseCommand, paletteGroups } from "./palette-model.js";
import { recentIds } from "./recent.js";

const KEYS = commandKeys([MAIN_KEYS, HUB_KEYS, TODAY_KEYS]);

export function openPalette(app, query = "") {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog picker palette");
    dialog.setAttribute("aria-label", "Go to or run");
    const row = element("div", "palette__input");
    row.append(element("span", "palette__prompt", "›"));
    const box = element("input", "palette__box");
    Object.assign(box, { type: "text", autocomplete: "off", value: query, spellcheck: false,
      placeholder: "Go to a note, page or command — start with : for commands" });
    box.setAttribute("role", "combobox");
    box.setAttribute("aria-expanded", "true");
    box.setAttribute("aria-label", "Go to or run");
    const context = element("span", "palette__context");
    row.append(box, context);
    const list = element("div", "picker__list palette__list");
    list.id = uniqueId("palette-list");
    list.setAttribute("role", "listbox");
    box.setAttribute("aria-controls", list.id);
    const foot = element("p", "palette__keys");
    for (const [key, words] of uiHints("palette")) foot.append(element("kbd", "palette__key", key), ` ${words}   `);
    dialog.append(row, list, foot);
    document.body.append(dialog);

    const notes = goToItems(app.tree, app.meetings);
    const byId = new Map(notes.map((item) => [item.id, item]));
    // A meeting of a series stands for it in the list; opened, it is recent in its own right.
    const recent = recentIds().filter((id) => app.tree.has(id) && id !== app.currentId)
      .map((id) => byId.get(id) ?? { id, title: app.tree.get(id).title, detail: whereText(app.tree, id) });
    let items = [];
    let active = 0;
    const draw = () => {
      const groups = paletteGroups({ query: box.value, recent, notes, commands: NOTE_COMMANDS, keys: KEYS, window: app.role });
      items = groups.flatMap((group) => group.items);
      active = Math.min(active, Math.max(0, items.length - 1));
      const command = box.value.trim().startsWith(":");
      const hub = app.tree.get(app.currentId);
      context.textContent = command && hub ? `on ${hub.title}` : "";
      let index = 0;
      list.replaceChildren(...(groups.length ? groups.flatMap((group) => [element("p", "palette__group", group.label),
        ...group.items.map((item) => option(item, index++))]) : [element("p", "picker__empty", "Nothing matches")]));
      mark();
    };
    const option = (item, index) => {
      const node = element("div", `picker__row palette__row palette__row--${item.kind}`);
      node.id = `${list.id}-${index}`;
      node.dataset.index = String(index);
      node.setAttribute("role", "option");
      node.append(element("span", "picker__title", item.title));
      if (item.detail) node.append(element("span", "picker__detail", item.detail));
      if (item.hint) node.append(element("kbd", "palette__hint", item.hint));
      return node;
    };
    const mark = () => {
      const options = list.querySelectorAll("[role=option]");
      options.forEach((node, index) => node.setAttribute("aria-selected", String(index === active)));
      const chosen = options[active];
      if (chosen) {
        box.setAttribute("aria-activedescendant", chosen.id);
        chosen.scrollIntoView?.({ block: "nearest" });
      } else {
        box.removeAttribute("aria-activedescendant");
      }
    };
    let done = false;
    const finish = (then = null) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      restoreFocus(before, () => app.focusNote());
      resolve();
      if (then) app.guard(Promise.resolve().then(then));
    };
    const take = (index, inNote = false) => {
      const item = items[index];
      if (!item) return undefined;
      if (item.kind === "note") {
        return finish(() => (inNote && app.role === "main" ? app.openInNoteWindow(item.id) : app.open(item.id)));
      }
      return finish(() => runNoteCommand(app, { name: item.command, arg: item.arg ?? "", bang: item.bang ?? false }));
    };
    box.addEventListener("input", () => {
      active = 0;
      draw();
    });
    box.addEventListener("keydown", (event) => {
      const action = uiAction(event, "palette");
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "next") active = Math.min(active + 1, items.length - 1);
      if (action === "previous") active = Math.max(active - 1, 0);
      if (action === "choose") return take(active);
      if (action === "chooseInNote") return take(active, true);
      if (action === "close") return finish();
      if (action === "complete") complete();
      return mark();
    });
    // Tab: the chosen command's full name, ready for its arguments.
    const complete = () => {
      const item = items[active];
      const typed = parseCommand(box.value);
      const command = item?.kind === "command" ? NOTE_COMMANDS.find((each) => each.name === item.command)
        : findCommand(NOTE_COMMANDS, typed.name);
      if (!command) return;
      box.value = `:${command.name}${typed.bang ? "!" : ""} ${typed.arg}`.replace(/\s+$/, " ");
      draw();
    };
    list.addEventListener("click", (event) => {
      const node = event.target.closest?.("[role=option]");
      if (node) take(Number(node.dataset.index), event.shiftKey);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    draw();
    openModal(dialog, box);
    box.setSelectionRange?.(box.value.length, box.value.length);
  });
}
