// Modal dialogs on the native <dialog> element (it keeps the focus inside and draws a
// backdrop). They know nothing about notes: they ask, then run what they were given.
//
//   const result = await formDialog({
//     title: "Rename",
//     text: "optional words under the title",
//     fields: [
//       { key: "title", label: "Title", value: "Kickoff" },                 // text (default)
//       { key: "day", label: "Date", type: "date", value: "2026-11-24" },
//       { key: "time", label: "Time", type: "time", value: "", optional: true },
//       { key: "hub", label: "Hub", type: "select", options: [["3", "Acme"]] },
//       { key: "name", label: "Person", suggestions: ["Jane Doe"] },          // a <datalist>
//       { key: "answer", label: "Answer", type: "textarea" },                  // several lines
//     ],
//     submit: "Rename",                 // or (values) => "Add new person": the label follows the fields
//     danger: false,                    // a red submit button (trash)
//     run: async (values) => ...,       // throws: its message shows here and the dialog stays
//   });                                 // -> what run returned, or null when cancelled
//
//   await confirmDialog({ title, text, confirm: "Move to trash", danger: true, run })
//
// Escape (ui-keys.js) or Cancel closes it with nothing changed; Enter submits, as on any form.
// Text fields are required unless optional. Afterwards the focus goes back to returnFocus, or
// where it was; when that element is gone (or was the page itself), fallbackFocus() decides.
import { element, restoreFocus, uniqueId } from "./dom.js";
import { uiAction } from "./ui-keys.js";

export function formDialog({ title, text = "", fields = [], submit = "OK", danger = false, run = async (values) => values,
  returnFocus = null, fallbackFocus = () => {} }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog");
    const form = element("form", "dialog__form");
    form.method = "dialog";
    const heading = element("h2", "dialog__title", title);
    heading.id = uniqueId("dialog-title");
    dialog.setAttribute("aria-labelledby", heading.id);
    form.append(heading);
    if (text) form.append(element("p", "dialog__text", text));
    const inputs = new Map(fields.map((field) => [field.key, fieldInput(field)]));
    for (const field of fields) form.append(labelled(field, inputs.get(field.key)));
    const error = element("p", "dialog__error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    const ok = element("button", `dialog__button dialog__button--ok${danger ? " dialog__button--danger" : ""}`);
    ok.type = "submit";
    const cancel = element("button", "dialog__button", "Cancel");
    cancel.type = "button";
    const buttons = element("div", "dialog__buttons");
    buttons.append(cancel, ok);
    form.append(error, buttons);
    dialog.append(form);
    document.body.append(dialog);

    const values = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.value]));
    const label = () => {
      ok.textContent = typeof submit === "function" ? submit(values()) : submit;
    };
    label();
    form.addEventListener("input", () => {
      label();
      error.hidden = true;
    });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      restoreFocus(returnFocus ?? before, fallbackFocus);
      resolve(result);
    };
    cancel.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener("keydown", (event) => {
      if (uiAction(event, "dialog") !== "close") return;
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const missing = fields.find((field) => field.type !== "select" && !field.optional && !inputs.get(field.key).value.trim());
      if (missing) {
        show(error, `${missing.label} is needed`);
        inputs.get(missing.key).focus();
        return;
      }
      ok.disabled = true;
      try {
        const result = await run(values());
        finish(result ?? true);
      } catch (failure) {
        show(error, failure?.message ?? String(failure));
        ok.disabled = false;
      }
    });
    dialog.showModal();
    const first = inputs.values().next().value ?? ok;
    first.focus();
    if (first.select && first.type === "text") first.select();
  });
}

export function confirmDialog({ title, text, confirm = "OK", danger = false, run = async () => true, ...focus }) {
  return formDialog({ title, text, submit: confirm, danger, run, ...focus });
}

function fieldInput(field) {
  if (field.type === "textarea") {
    const area = element("textarea", "dialog__input dialog__input--area");
    area.rows = field.rows ?? 4;
    area.value = field.value ?? "";
    if (field.placeholder) area.placeholder = field.placeholder;
    return area;
  }
  if (field.type === "select") {
    const select = element("select", "dialog__input");
    for (const [value, text] of field.options ?? []) {
      const option = element("option", "", text);
      option.value = value;
      select.append(option);
    }
    if (field.value !== undefined) select.value = field.value;
    return select;
  }
  const input = element("input", "dialog__input");
  input.type = field.type ?? "text";
  input.autocomplete = "off";
  input.value = field.value ?? "";
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.suggestions?.length) {
    const list = element("datalist");
    list.id = uniqueId("dialog-list");
    for (const suggestion of field.suggestions) {
      const option = element("option");
      option.value = suggestion;
      list.append(option);
    }
    input.setAttribute("list", list.id);
    input.list$ = list;
  }
  return input;
}

function labelled(field, input) {
  const label = element("label", "dialog__field");
  label.append(element("span", "dialog__label", field.label), input);
  if (input.list$) label.append(input.list$);
  return label;
}

function show(node, text) {
  node.textContent = text;
  node.hidden = false;
}
