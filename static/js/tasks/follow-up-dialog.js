// Logging a follow-up from Today (Figma 54:953): "Followed up with {person}", what happened (one
// line, optional, it goes in the task's history), then Follow up again (on a day: a date box
// with quick picks) or Close it. Logging posts /api/task/followed_up and says what it did in the
// status line. The words and days come from follow-up-model.js; keys from ui/ui-keys.js
// ("dialog" and "choices").
//
//   followUpDialog(app, taskId)        Space on a follow-up row (and its → glyph)
//   followUpDialog(app, taskId, { dateOnly: true })   r: only the date box, logged with no note
//   closeFollowUp(app, taskId)         c: closed, logged with no note, no dialog
// Each resolves with the task the server returns, or null when the dialog was cancelled;
// errors from the server show inside the dialog, which stays open.
import { localDay } from "../meetings/meeting-days.js";
import { hubOf } from "../notes/hub-groups.js";
import { dayText } from "../ui/dates.js";
import { element, openModal, restoreFocus, uniqueId } from "../ui/dom.js";
import { uiAction } from "../ui/ui-keys.js";
import { QUICK_PICKS, defaultNextDay, followUpLine, loggedText, parseNextDay } from "./follow-up-model.js";

// The server's limit on the note (follow_up_logs.note).
const NOTE_MAX = 500;

const CHOICES = [
  { value: "again", title: "Follow up again", text: "" },
  { value: "closed", title: "Close it", text: "done: they did it, or it no longer matters" },
];

function followUpTask(app, taskId) {
  const task = app.tasks.get(taskId);
  if (!task) throw new Error("E: that task is gone (deleted in another window?)");
  return task;
}

async function logFollowUp(app, task, { note = "", outcome, next = "" }) {
  const today = localDay(app.today());
  if (note.length > NOTE_MAX) throw new Error(`What happened is ${note.length} characters: ${NOTE_MAX} at most`);
  const saved = await app.tasksApi.followedUp(task.id, { note, outcome, next, today });
  app.changes.send({ type: "changed", what: ["tasks"] });
  await app.refreshTree();
  app.say(loggedText(outcome, next, task.title, today));
  return saved;
}

export async function closeFollowUp(app, taskId) {
  const task = followUpTask(app, taskId);
  return logFollowUp(app, task, { outcome: "closed" });
}

export function followUpDialog(app, taskId, { dateOnly = false } = {}) {
  const task = followUpTask(app, taskId);
  const person = app.tree.get(task.delegate_id);
  const hub = hubOf(app.tree, task.note_id) ?? app.tree.get(task.note_id);
  const today = localDay(app.today());
  const settings = { ...(app.timeSettings?.settings ?? {}), holidays: (app.timeSettings?.upcoming ?? []).map((each) => each.day) };
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog follow-up-dialog");
    const form = element("form", "dialog__form");
    form.method = "dialog";
    const name = person?.title ?? "them";
    const heading = element("h2", "dialog__title", dateOnly ? `Follow up again with ${name}` : `Followed up with ${name}`);
    heading.id = uniqueId("dialog-title");
    dialog.setAttribute("aria-labelledby", heading.id);
    form.append(heading, element("p", "dialog__text follow-up-dialog__line", followUpLine(task, hub, task.follow_up_count)));

    const note = dateOnly ? null : noteField();
    if (note) form.append(note.field);
    const date = dateField(defaultNextDay(today, settings), today);
    const choices = dateOnly ? null : choiceGroup(date);
    if (choices) form.append(choices.group);
    else form.append(date.field);

    const error = element("p", "dialog__error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    const ok = element("button", "dialog__button dialog__button--ok");
    ok.type = "submit";
    ok.append("Log ", element("kbd", "dialog__button-key follow-up-dialog__key", "Enter"));
    const cancel = element("button", "dialog__button");
    cancel.type = "button";
    cancel.append("Cancel ", element("kbd", "dialog__button-key", "Esc"));
    const buttons = element("div", "dialog__buttons");
    buttons.append(cancel, ok);
    form.append(error, buttons);
    dialog.append(form);
    document.body.append(dialog);

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      restoreFocus(before, () => app.focusNote?.());
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
      } else if (action === "close") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    });
    form.addEventListener("input", () => {
      error.hidden = true;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (ok.disabled) return;
      ok.disabled = true;
      try {
        const outcome = choices ? choices.value() : "again";
        const next = outcome === "again" ? parseNextDay(date.input.value, today) : "";
        finish(await logFollowUp(app, task, { note: note ? note.input.value.trim() : "", outcome, next }) ?? true);
      } catch (failure) {
        error.textContent = failure?.message ?? String(failure);
        error.hidden = false;
        ok.disabled = false;
      }
    });
    choices?.onSubmit(() => form.requestSubmit());
    const first = note ? note.input : date.input;
    openModal(dialog, first);
    if (first === date.input) first.select();
  });
}

function noteField() {
  const field = element("label", "dialog__field");
  const input = element("input", "dialog__input");
  input.type = "text";
  input.autocomplete = "off";
  input.maxLength = NOTE_MAX;
  input.placeholder = "optional";
  field.append(element("span", "dialog__label", "What happened"), input,
    element("span", "follow-up-dialog__hint", "goes in the task's history"));
  return { field, input };
}

/** The date box, the day it reads as (worked out as it is typed), and the quick picks. */
function dateField(value, today) {
  const field = element("div", "dialog__field follow-up-dialog__date");
  const label = element("label", "follow-up-dialog__date-row");
  const input = element("input", "dialog__input follow-up-dialog__date-input");
  input.type = "text";
  input.autocomplete = "off";
  input.value = value;
  input.setAttribute("aria-label", "Follow up on");
  input.placeholder = "2026-12-01, tomorrow, mon, +3";
  const reads = element("span", "follow-up-dialog__reads");
  const show = () => {
    let text = "";
    try {
      text = dayText(parseNextDay(input.value, today), { today });
    } catch {
      text = "";
    }
    reads.textContent = text;
  };
  input.addEventListener("input", show);
  show();
  label.append(input, reads);
  const picks = element("div", "follow-up-dialog__picks");
  QUICK_PICKS.forEach(({ word, label: text }, at) => {
    if (at) picks.append(element("span", "follow-up-dialog__dot", " · "));
    const pick = element("button", "follow-up-dialog__pick", text);
    pick.type = "button";
    pick.addEventListener("click", () => {
      input.value = parseNextDay(word, today);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
    picks.append(pick);
  });
  field.append(label, picks);
  const setEnabled = (on) => {
    input.disabled = !on;
    for (const pick of picks.querySelectorAll("button")) pick.disabled = !on;
    field.classList.toggle("follow-up-dialog__date--off", !on);
  };
  return { field, input, setEnabled };
}

/** Follow up again (with the date box under it) or Close it: radios stacked; j k and the
 * arrows switch while they have the focus, Enter logs. */
function choiceGroup(date) {
  const group = element("div", "follow-up-dialog__choices");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "What next");
  let value = "again";
  let submit = () => {};
  const buttons = CHOICES.map(({ value: option, title, text }) => {
    const button = element("button", `follow-up-dialog__choice follow-up-dialog__choice--${option}`);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset.value = option;
    button.append(element("span", "follow-up-dialog__mark"), element("span", "follow-up-dialog__title", title));
    if (text) button.append(element("span", "follow-up-dialog__what", text));
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
    date.setEnabled(option === "again");
  };
  group.addEventListener("keydown", (event) => {
    const button = event.target.closest?.(".follow-up-dialog__choice");
    if (!button) return;
    const action = uiAction(event, "choices");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "submit") return submit();
    const at = buttons.findIndex((each) => each.dataset.value === value);
    const next = buttons[(at + (action === "next" ? 1 : buttons.length - 1)) % buttons.length];
    pick(next.dataset.value);
    next.focus();
    return undefined;
  });
  group.append(buttons[0], date.field, buttons[1]);
  pick(value);
  return { group, value: () => value, onSubmit: (run) => { submit = run; } };
}
