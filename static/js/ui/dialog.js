// Modal dialogs on the native <dialog> element (it keeps the focus inside and draws a
// backdrop). They know nothing about notes: they ask, then run what they were given.
//
//   const result = await formDialog({
//     title: "Rename",
//     text: "optional words under the title",
//     lines: ["a list under the words"],  // optional (a date history...)
//     fields: [
//       { key: "title", label: "Title", value: "Kickoff" },                 // text (default)
//       { key: "day", label: "Date", type: "date", value: "2026-11-24" },
//       { key: "time", label: "Time", type: "time", value: "", optional: true },
//       { key: "hub", label: "Hub", type: "select", options: [["3", "Acme"]] },
//       { key: "name", label: "Person", suggestions: ["Jane Doe"] },          // a <datalist>
//       { key: "answer", label: "Answer", type: "textarea" },                  // several lines
//       { key: "health", label: "Health", type: "choice", value: "at_risk",   // buttons, one on;
//         options: [["on_track", "On track", "1"], ...] },                     // the key picks it
//       { key: "text", type: "textarea", add: { label: "Since last log:", lines: ["..."] } },
//     ],                                // add: lines a click puts in the text box
//     submit: "Rename",                 // or (values) => "Add new person": the label follows the fields;
//                                       // or (values) => { text, blocked: true }: Enter and the
//                                       // button do nothing until the fields change ("2 people
//                                       // match: type more")
//     danger: false,                    // a red submit button (trash)
//     safeFocus: false,                 // opens on Cancel, so a reflex Enter changes nothing
//                                       // (a confirm that deletes for good)
//     live: (values) => "...",          // a line under the fields, worked out again as they
//                                       // change (Edit dates' knock-on effect), in red; or
//                                       // { text, plain: true }: dim, not a warning (a preview)
//     run: async (values) => ...,       // throws: its message shows here and the dialog stays
//   });                                 // -> what run returned, or null when cancelled
//
//   await confirmDialog({ title, text, confirm: "Move to trash", danger: true, run })
//
// Escape (ui-keys.js) or Cancel closes it with nothing changed; Enter submits, as on any form,
// and Ctrl-Enter too (from a text box with several lines).
// Text fields are required unless optional. Afterwards the focus goes back to returnFocus, or
// where it was; when that element is gone (or was the page itself), fallbackFocus() decides.
import { element, openModal, restoreFocus, uniqueId } from "./dom.js";
import { uiAction } from "./ui-keys.js";

export function formDialog({ title, text = "", lines = [], fields = [], submit = "OK", danger = false, run = async (values) => values,
  returnFocus = null, fallbackFocus = () => {}, live = null, safeFocus = false }) {
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
    if (lines.length) {
      const list = element("ul", "dialog__lines");
      for (const line of lines) list.append(element("li", "dialog__line", line));
      form.append(list);
    }
    const inputs = new Map(fields.map((field) => [field.key, fieldInput(field)]));
    for (const field of fields) form.append(labelled(field, inputs.get(field.key)));
    const liveLine = live ? element("p", "dialog__live") : null;
    if (liveLine) form.append(liveLine);
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
    let blocked = false;
    const label = () => {
      const button = typeof submit === "function" ? submit(values()) : submit;
      ok.textContent = typeof button === "string" ? button : button.text ?? "";
      blocked = typeof button !== "string" && Boolean(button.blocked);
      ok.disabled = blocked;
      if (liveLine) {
        const said = live(values()) ?? "";
        liveLine.textContent = typeof said === "string" ? said : said.text ?? "";
        liveLine.classList.toggle("dialog__live--plain", typeof said !== "string" && Boolean(said.plain));
        liveLine.hidden = !liveLine.textContent;
      }
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
      const action = uiAction(event, "dialog");
      if (action === "submit") {
        event.preventDefault();
        form.requestSubmit();
        return;
      }
      if (action !== "close") return;
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (blocked || ok.disabled) return;
      const missing = fields.find((field) => field.type !== "select" && !field.optional && !String(inputs.get(field.key).value).trim());
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
        label();
      }
    });
    const first = inputs.values().next().value ?? (safeFocus ? cancel : ok);
    openModal(dialog, first);
    if (first.select && first.type === "text") first.select();
  });
}

export function confirmDialog({ title, text, lines = [], confirm = "OK", danger = false, run = async () => true, ...focus }) {
  return formDialog({ title, text, lines, submit: confirm, danger, run, ...focus });
}

function fieldInput(field) {
  if (field.type === "choice") return choiceInput(field);
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

/** A row of buttons of which one is on (role radio), standing in for an input: value, focus. */
function choiceInput(field) {
  const group = element("div", "dialog__choices");
  group.setAttribute("role", "radiogroup");
  let value = field.value ?? field.options?.[0]?.[0] ?? "";
  const buttons = (field.options ?? []).map(([option, text, key]) => {
    const button = element("button", `dialog__choice dialog__choice--${option}`);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset.value = option;
    button.append(text);
    if (key) {
      button.append(" ", element("kbd", "dialog__choice-key", key));
      button.dataset.key = key;
    }
    button.addEventListener("click", () => pick(option));
    return button;
  });
  const pick = (option) => {
    value = option;
    for (const button of buttons) {
      const on = button.dataset.value === option;
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on ? 0 : -1;
    }
    group.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // A choice's key picks it while the focus isn't in a text box (typing "1" stays text).
  group.addEventListener("keydown", (event) => {
    const button = buttons.find((each) => each.dataset.key === event.key);
    if (!button || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    pick(button.dataset.value);
    button.focus();
  });
  group.append(...buttons);
  Object.defineProperty(group, "value", { get: () => value });
  group.focus = () => (buttons.find((button) => button.dataset.value === value) ?? buttons[0])?.focus();
  pick(value);
  return group;
}

function labelled(field, input) {
  const label = element(field.type === "choice" ? "div" : "label", "dialog__field");
  label.append(element("span", "dialog__label", field.label ?? ""), input);
  if (input.list$) label.append(input.list$);
  if (field.add?.lines?.length) label.append(addLines(field.add, input));
  return label;
}

/** "Since last log — click to add:" and its lines: a click adds one to the text box. */
function addLines({ label, lines }, input) {
  const box = element("div", "dialog__adds");
  box.append(element("p", "dialog__adds-label", label));
  for (const line of lines) {
    const button = element("button", "dialog__add", `+ ${line}`);
    button.type = "button";
    button.addEventListener("click", () => {
      const text = input.value.replace(/\s+$/, "");
      input.value = text ? `${text}\n${line}` : line;
      button.disabled = true;
      input.focus();
    });
    box.append(button);
  }
  return box;
}

function show(node, text) {
  node.textContent = text;
  node.hidden = false;
}
