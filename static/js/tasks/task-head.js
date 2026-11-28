// The head of a task's page (task-page.js): on the left the box (Space), the title and its
// chips (due or late, the estimate, each placed block); on the right Done, Schedule, Delegate,
// Edit… (E: title, due date, estimate, for whom; the notes are the Notes card's) and ··· (the
// other task actions); under it the facts row (Project, For, Delegated to,
// Next block). The words are task-page-model.js's; the buttons only carry a data-action the
// page performs on the page's own task.
//
//   drawHead({ ctx, task, now, readOnly, box })   the head (the page makes it row 0)
//   drawFacts(ctx, task, now)                     the facts row (the project is a link:
//                                                 data-note on its button)
import { chip } from "../ui/chip.js";
import { keyCap } from "../ui/key-hints.js";
import { headChips, taskFacts } from "./task-page-model.js";
import { element } from "./task-side.js";

export function drawHead({ ctx, task, now, readOnly = false, box }) {
  const head = element("header", `task-page__head${task.done ? " task-page__head--done" : ""}`);
  const left = element("div", "task-page__head-main");
  const line = element("div", "task-page__title-line");
  line.append(box(task), element("h2", "task-page__title", task.title || "(no text)"));
  left.append(line);
  const chips = headChips(ctx, task, now);
  if (chips.length) {
    const row = element("div", "task-page__chips");
    for (const each of chips) row.append(chip(each.text, each.tone));
    left.append(row);
  }
  head.append(left);
  if (!readOnly) head.append(buttons(task));
  return head;
}

function buttons(task) {
  const box = element("div", "task-page__buttons");
  const delegated = task.delegate_id !== null && task.delegate_id !== undefined;
  for (const [text, key, action, title, primary] of [
    [task.done ? "Reopen" : "Done", "Space", "toggleTask", task.done ? "Open it again" : "Mark it done, with everything under it", true],
    ["Schedule", "s", "scheduleTask", "Its estimate (or 30 min) in the first free slot before it is due", false],
    [delegated ? "Take back" : "Delegate", "d", "delegateTask", delegated ? "Make it yours again" : "Hand it to someone, and when to follow it up", false],
    ["Edit…", "E", "editTask", "Title, due date, estimate, for whom", false],
  ]) {
    const node = element("button", `task-page__button${primary ? " task-page__button--primary" : ""}`, text);
    node.type = "button";
    node.tabIndex = -1;
    node.title = `${title} (${key})`;
    node.dataset.action = action;
    node.append(" ", keyCap(key));
    box.append(node);
  }
  const more = element("button", "task-page__button task-page__more", "···");
  more.type = "button";
  more.tabIndex = -1;
  more.title = "More: delete…";
  more.setAttribute("aria-label", "More task actions");
  more.dataset.action = "moreTask";
  box.append(more);
  return box;
}

export function drawFacts(ctx, task, now) {
  const row = element("dl", "task-page__facts");
  for (const fact of taskFacts(ctx, task, now)) {
    const item = element("div", `task-page__fact task-page__fact--${fact.key}`);
    item.append(element("dt", "task-page__fact-label", fact.label));
    const value = element("dd", "task-page__fact-value");
    if (fact.noteId !== undefined && fact.noteId !== null) {
      const link = element("button", "task-page__note-link", fact.text);
      link.type = "button";
      link.tabIndex = -1;
      link.title = "Its dashboard";
      link.dataset.note = String(fact.noteId);
      value.append(link);
    } else {
      value.textContent = fact.text;
    }
    item.append(value);
    row.append(item);
  }
  return row;
}
