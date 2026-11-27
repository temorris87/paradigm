// The ? list: every key of a view, read-only, in a modal dialog on the overlay surface. It
// knows nothing about views: the caller hands it the groups (ui/key-hints.js keyGroups).
//
//   const closed = openKeysDialog({ title, groups: [{ name, rows: [{ keys, help }] }] });
//     -> a promise that settles once it closes
//
// Escape (ui-keys.js "dialog") or Close shuts it, and the focus goes back where it was.
import { element, openModal, restoreFocus, uniqueId } from "./dom.js";
import { keyCap } from "./key-hints.js";
import { uiAction } from "./ui-keys.js";

export function openKeysDialog({ title = "Keys", groups = [] }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog keys-dialog");
    const heading = element("h2", "dialog__title", title);
    heading.id = uniqueId("keys-title");
    dialog.setAttribute("aria-labelledby", heading.id);
    const body = element("div", "keys-dialog__body");
    for (const group of groups) {
      const section = element("section", "keys-dialog__group");
      const name = element("h3", "keys-dialog__name", group.name);
      const list = element("dl", "keys-dialog__list");
      for (const row of group.rows) {
        const keys = element("dt", "keys-dialog__keys");
        row.keys.forEach((key, index) => {
          if (index) keys.append(" ");
          keys.append(keyCap(key));
        });
        list.append(keys, element("dd", "keys-dialog__help", row.help));
      }
      section.append(name, list);
      body.append(section);
    }
    const close = element("button", "dialog__button", "Close");
    close.type = "button";
    const buttons = element("div", "dialog__buttons");
    buttons.append(close);
    dialog.append(heading, body, buttons);
    document.body.append(dialog);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      restoreFocus(before);
      resolve();
    };
    close.addEventListener("click", finish);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    dialog.addEventListener("keydown", (event) => {
      if (uiAction(event, "dialog") !== "close") return;
      event.preventDefault();
      event.stopPropagation();
      finish();
    });
    openModal(dialog, close);
  });
}
