// Inbox triage (File all…, F on Today): the Inbox one note at a time. Each shows its title,
// the start of its text and when it was made, the hub its links and mentions point to most,
// and what to do with it, each with a key (triage-keys.js): under that hub, into a Resources
// folder, under another note, a project or an area, a task (and the note to the Trash), or the
// Trash. Space skips, o opens it to read, u undoes the last one, Escape stops.
//
//   await triageInbox(app)
import { inboxNotes } from "../today/today-facts.js";
import { folderTargets } from "../resources/folder-commands.js";
import { moveTargets } from "../notes/note-actions.js";
import { element, openModal, restoreFocus } from "../ui/dom.js";
import { pickFrom } from "../ui/picker.js";
import { dayText } from "../ui/dates.js";
import { dayOf } from "../hubs/hub-sections.js";
import { keyOf, triageAction, triageHints } from "./triage-keys.js";
import { suggestHub, triageOptions } from "./triage-model.js";

const EXCERPT = 220;

export function triageInbox(app) {
  const queue = inboxNotes(app.tree).map((note) => note.id);
  if (!queue.length) {
    app.say("The Inbox is empty");
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog triage");
    dialog.setAttribute("aria-label", "Triage inbox");
    document.body.append(dialog);
    const total = queue.length;
    let at = 0;
    let active = 0;
    let options = [];
    let last = null; // { id, undo() } the last filing, for u
    let busy = false;

    const finish = () => {
      dialog.close();
      dialog.remove();
      restoreFocus(before, () => app.focusNote());
      resolve();
    };
    const ctx = () => ({ tree: app.tree, links: app.linkIndex.links, mentions: app.linkIndex.mentions, people: app.people });

    const draw = async () => {
      const id = queue[at];
      if (id === undefined || !app.tree.has(id)) {
        if (at < queue.length - 1 && id !== undefined) {
          at += 1;
          return draw();
        }
        app.say(`Inbox triaged: ${total} note${total === 1 ? "" : "s"} gone through`);
        return finish();
      }
      const note = await app.api.get(id);
      const suggested = suggestHub(ctx(), id);
      options = triageOptions(suggested);
      active = 0;
      const head = element("div", "triage__head");
      head.append(element("h2", "dialog__title", "Triage inbox"), element("span", "triage__count", `${at + 1} of ${total}`));
      const ticks = element("div", "triage__ticks");
      for (let n = 0; n < total; n += 1) ticks.append(element("span", `triage__tick${n < at ? " triage__tick--done" : ""}`));
      const preview = element("div", "triage__preview");
      const body = String(note.body ?? "");
      const images = (body.match(/!\[[^\]]*\]\(/g) ?? []).length;
      preview.append(element("p", "triage__title", note.title),
        element("p", "triage__excerpt", `${body.replace(/\s+/g, " ").trim().slice(0, EXCERPT) || "Nothing written"}${body.length > EXCERPT ? "…" : ""}`),
        element("p", "triage__meta", [images ? `${images} image${images === 1 ? "" : "s"}` : "", `created ${dayText(dayOf(note.created_at ?? note.updated_at))}`]
          .filter(Boolean).join(" · ")));
      const hint = element("p", "triage__suggested", suggested
        ? `Suggested: ${suggested.hub.title}, it links or mentions it ${suggested.count}×` : "No hub suggested: nothing in it links to one");
      const list = element("ul", "picker__list triage__options");
      list.setAttribute("role", "listbox");
      options.forEach((option, index) => {
        const row = element("li", `picker__row triage__option${option.danger ? " triage__option--danger" : ""}`);
        row.setAttribute("role", "option");
        row.dataset.index = String(index);
        row.append(element("kbd", "key", keyOf(option.action)), element("span", "picker__title", option.label));
        if (option.detail) row.append(element("span", "picker__detail", option.detail));
        row.addEventListener("click", () => run(option.action));
        list.append(row);
      });
      const foot = element("p", "triage__keys");
      for (const [key, words] of triageHints()) foot.append(element("kbd", "key", key), ` ${words}   `);
      dialog.replaceChildren(head, ticks, preview, hint, list, foot);
      mark();
      return undefined;
    };
    const mark = () => dialog.querySelectorAll("[role=option]").forEach((row, index) => row.setAttribute("aria-selected", String(index === active)));

    const step = async (work) => {
      if (busy) return;
      busy = true;
      try {
        const done = await work();
        if (done !== false) {
          await app.refreshTree();
          app.changes.send({ type: "changed", what: ["notes", "tasks"] });
          at += 1;
        }
      } catch (error) {
        app.say(error?.message ?? String(error));
      } finally {
        busy = false;
      }
      await draw();
    };

    const run = (action) => step(async () => {
      const id = queue[at];
      const note = app.tree.get(id);
      const suggested = suggestHub(ctx(), id);
      switch (action) {
        case "underSuggested": {
          if (!suggested) return false;
          await app.api.move(id, suggested.hub.id);
          last = { undo: () => app.api.move(id, null) };
          return true;
        }
        case "project":
        case "area":
          await app.api.setKind(id, action);
          last = { undo: () => app.api.setKind(id, null) };
          return true;
        case "resource": {
          const picked = await pickFrom({ title: `"${note.title}" into…`, placeholder: "part of a folder's name", items: folderTargets(app.folders) });
          if (!picked?.item) return false;
          await app.api.setKind(id, "resource");
          if (picked.item.id) await app.foldersApi.putNote(id, picked.item.id);
          last = { undo: () => app.api.setKind(id, null) };
          return true;
        }
        case "underNote": {
          const picked = await pickFrom({ title: `"${note.title}" under…`, placeholder: "part of a title or path", items: moveTargets(app.tree, id) });
          if (!picked?.item) return false;
          await app.api.move(id, picked.item.id);
          last = { undo: () => app.api.move(id, null) };
          return true;
        }
        case "task": {
          const hub = suggested?.hub ?? (await pickHub(app));
          if (!hub) return false;
          const task = await app.tasksApi.create(hub.id, note.title);
          await app.api.remove(id, true);
          last = { undo: async () => {
            await app.trashApi.restore(id);
            await app.tasksApi.remove(task.id);
          } };
          return true;
        }
        case "trash":
          await app.api.remove(id, true);
          last = { undo: () => app.trashApi.restore(id) };
          return true;
        default:
          return false;
      }
    });

    dialog.addEventListener("keydown", (event) => {
      const action = triageAction(event);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "stop") return finish();
      if (action === "next") active = Math.min(active + 1, options.length - 1);
      if (action === "previous") active = Math.max(active - 1, 0);
      if (action === "next" || action === "previous") return mark();
      if (action === "choose") return run(options[active]?.action);
      if (action === "skip") {
        at += 1;
        return draw();
      }
      if (action === "open") return app.guard(app.openInNoteWindow(queue[at]));
      if (action === "undo") {
        if (!last || at === 0) return undefined;
        const undo = last;
        last = null;
        return step(async () => {
          await undo.undo();
          at -= 2; // step moves on by one: back to the note undone
          return true;
        });
      }
      if (options.some((option) => option.action === action)) return run(action);
      return undefined;
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    draw().then(() => openModal(dialog, dialog));
    dialog.tabIndex = -1;
  });
}

/** A hub for "turn into a task" when none is suggested. */
async function pickHub(app) {
  const hubs = app.tree.children(null).filter((note) => (note.kind === "project" || note.kind === "area") && !note.archived_at);
  const picked = await pickFrom({ title: "A task in which hub?", placeholder: "part of its name",
    items: hubs.map((hub) => ({ id: hub.id, title: hub.title })) });
  return picked?.item ? app.tree.get(picked.item.id) : null;
}
