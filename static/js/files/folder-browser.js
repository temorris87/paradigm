// The folder browser: "Add file…" in a modal <dialog> when the computer's own file dialog
// can't open (no tkinter on the server, or PARADIGM_FILE_PICKER=browser). It walks the
// folders through /api/folders/browse and hands back the file picked; it knows nothing about
// hubs or attaching. Its keys are in folder-browser-keys.js.
//
//   const path = await browseForFile({ api: filesApi, start: "C:\\…\\Pilot", title,
//                                      fallbackFocus });   // -> the file's path, or null
//
// It shows the current path at the top, then the folder's subfolders and files (by name), and
// its keys at the foot in the shared key caps. Up from a root lists the roots. Afterwards the
// focus goes back where it was (the Files section).
import { element, openModal, restoreFocus, uniqueId } from "../ui/dom.js";
import { filterAction, folderBrowserHints, listKeyReader } from "./folder-browser-keys.js";
import { drawKeyHints } from "../ui/key-hints.js";
import { entriesOf, filterEntries, moveActive, rootEntries, sizeText } from "./folder-browser-model.js";
import { dayText } from "../ui/dates.js";

const ROOTS_LABEL = "OneDrive folders";

export function browseForFile({ api, start = null, title = "Add a file", fallbackFocus = () => {} }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog picker folder-browser");
    const heading = element("h2", "dialog__title", title);
    heading.id = uniqueId("folder-browser-title");
    dialog.setAttribute("aria-labelledby", heading.id);
    const where = element("p", "folder-browser__path");
    const filter = element("input", "dialog__input folder-browser__filter");
    Object.assign(filter, { type: "text", autocomplete: "off", placeholder: "part of the name", hidden: true });
    filter.setAttribute("aria-label", "Filter by name");
    const list = element("ul", "picker__list folder-browser__list");
    list.id = uniqueId("folder-browser-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", title);
    list.tabIndex = 0;
    const error = element("p", "dialog__error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    const foot = element("p", "folder-browser__keys");
    drawKeyHints(foot, folderBrowserHints());
    dialog.append(heading, where, filter, list, error, foot);
    document.body.append(dialog);

    const read = listKeyReader();
    // at: the folder shown, or null while the roots are listed.
    let state = { at: null, parent: null, roots: [], all: [], rows: [], active: 0 };
    let done = false;

    const draw = () => {
      const keep = state.rows[state.active]?.path;
      state.rows = filterEntries(state.all, filter.value);
      const again = state.rows.findIndex((row) => row.path === keep);
      state.active = moveActive(again >= 0 ? again : state.active, null, state.rows.length);
      where.textContent = state.at ?? ROOTS_LABEL;
      where.title = where.textContent;
      list.replaceChildren(...(state.rows.length ? state.rows.map(row)
        : [element("li", "picker__empty", filter.value.trim() ? "Nothing matches" : "This folder is empty")]));
      mark();
    };
    const row = (entry, index) => {
      const li = element("li", `picker__row folder-browser__row folder-browser__row--${entry.kind}`);
      li.id = `${list.id}-${index}`;
      li.dataset.index = String(index);
      li.setAttribute("role", "option");
      li.append(element("span", "picker__title", entry.kind === "folder" ? `📁 ${entry.name}` : entry.name));
      if (entry.kind === "file") {
        const detail = [sizeText(entry.size), entry.modified ? dayText(entry.modified.slice(0, 10)) : ""].filter(Boolean).join(" · ");
        if (detail) li.append(element("span", "picker__detail", detail));
      }
      return li;
    };
    const mark = () => {
      const options = list.querySelectorAll("[role=option]");
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === state.active)));
      const chosen = options[state.active];
      if (chosen) {
        list.setAttribute("aria-activedescendant", chosen.id);
        chosen.scrollIntoView?.({ block: "nearest" });
      } else {
        list.removeAttribute("aria-activedescendant");
      }
    };
    const say = (message) => {
      error.textContent = message ?? "";
      error.hidden = !message;
    };

    /** Shows a folder; on an error the folder shown stays, with the server's message. */
    const load = async (path, { select = null } = {}) => {
      let listing;
      try {
        listing = await api.browse(path);
      } catch (failure) {
        say(failure.message);
        return false;
      }
      if (done) return true;
      say(null);
      filter.value = "";
      filter.hidden = true;
      const all = entriesOf(listing);
      const at = all.findIndex((entry) => entry.path === select);
      state = { at: listing.path ?? path, parent: listing.parent ?? null, roots: listing.roots ?? state.roots, all, rows: [],
        active: Math.max(0, at) };
      draw();
      return true;
    };
    const showRoots = (select = null) => {
      filter.value = "";
      filter.hidden = true;
      const all = rootEntries(state.roots);
      state = { ...state, at: null, parent: null, all, rows: [], active: Math.max(0, all.findIndex((entry) => entry.path === select)) };
      draw();
    };
    const up = () => {
      if (state.at === null) return;
      if (state.parent === null) showRoots(state.at);
      else load(state.parent, { select: state.at });
    };
    const open = () => {
      const entry = state.rows[state.active];
      if (!entry) return;
      if (entry.kind === "folder") load(entry.path);
      else finish(entry.path);
    };
    const finish = (result) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      restoreFocus(before, fallbackFocus);
      resolve(result);
    };

    list.addEventListener("keydown", (event) => {
      const action = read(event);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "pending") return;
      if (action === "open") return open();
      if (action === "up") return up();
      if (action === "cancel") return finish(null);
      if (action === "filter") {
        filter.hidden = false;
        filter.focus();
        // The last filter stays shown but selected: what is typed next replaces it.
        filter.select();
        return undefined;
      }
      state.active = moveActive(state.active, action, state.rows.length);
      return mark();
    });
    filter.addEventListener("input", () => draw());
    filter.addEventListener("keydown", (event) => {
      if (filterAction(event) !== "list") return;
      event.preventDefault();
      event.stopPropagation();
      if (!filter.value.trim()) filter.hidden = true;
      list.focus();
    });
    list.addEventListener("click", (event) => {
      const option = event.target.closest?.("[role=option]");
      if (!option) return;
      state.active = Number(option.dataset.index);
      mark();
      open();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });

    draw();
    openModal(dialog, list);
    (async () => {
      // A start folder that can't be read falls back to the roots (the plain browse answer).
      if (start !== null && await load(start)) return;
      try {
        const { roots = [] } = await api.browse();
        state.roots = roots;
        showRoots();
      } catch (failure) {
        say(failure.message);
      }
    })();
  });
}
