// The side column of a task's page (task-page.js): its cards in their order (Subtasks, Emails,
// Files, From, History: task-page-model.js SIDE_CARDS), the Subtasks card's rows, and the card
// every part of the page draws in (the Notes card too).
//
//   card(key, title, count?, ...extras)   <section class="task-card task-card--key">: a head of
//                                         the title, a count ("1 of 2 done") and its buttons
//   actionButton(text, action, title)     a card's "+ Subtask", "+ Add file…" (data-action)
//   subtasksCard({ ctx, subs, option, box, readOnly, today })   the Subtasks card; subs: taskTree
//                                         rows; option(node, task) makes a row an option
//   drawSide(cards)                       { key: node or null } -> the column, in SIDE_CARDS order
//   element(tag, className, text?)
import { keyCap } from "../ui/key-hints.js";
import { SIDE_CARDS, subtaskCount, subtaskDetail } from "./task-page-model.js";

// The deepest indent drawn: a task has at most 4 levels under it (MAX_TASK_DEPTH).
const MAX_INDENT = 4;

export function element(tag, className, text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

export function card(key, title, count = "", ...extras) {
  const node = element("section", `task-card task-card--${key}`);
  const head = element("header", "task-card__head");
  head.append(element("h3", "task-card__title", title));
  if (count) head.append(element("span", "task-card__count", count));
  for (const extra of extras.filter(Boolean)) head.append(extra);
  node.append(head);
  return node;
}

export function actionButton(text, action, title) {
  const node = element("button", "task-card__add", text);
  node.type = "button";
  node.tabIndex = -1;
  node.title = title;
  node.dataset.action = action;
  return node;
}

export function subtasksCard({ ctx, subs, option, box, readOnly = false, today = null }) {
  const add = readOnly ? null : actionButton("+ Subtask", "addDirect", "A subtask of this task (a adds one under the selected row)");
  if (add) add.append(" ", keyCap("a"));
  const node = card("subtasks", "Subtasks", subs.length ? subtaskCount(subs.map((row) => row.task)) : "", add);
  if (!subs.length) {
    node.append(element("p", "task-card__hint", readOnly ? "No subtasks" : "No subtasks yet. a adds one."));
    return node;
  }
  for (const { task, depth } of subs) {
    const classes = ["task-sub__row", `task-sub__row--depth-${Math.min(depth, MAX_INDENT)}`, task.done && "task-sub__row--done"];
    const row = element("div", classes.filter(Boolean).join(" "));
    const title = element("button", "task-sub__title", task.title || "(no text)");
    title.type = "button";
    title.tabIndex = -1;
    title.title = "Its own page (Enter)";
    title.dataset.action = "open";
    row.append(box(task), title);
    const detail = subtaskDetail(ctx, task, today);
    if (detail) row.append(element("span", "task-sub__detail", detail));
    node.append(option(row, task));
  }
  return node;
}

export function drawSide(cards) {
  const side = element("div", "task-page__side");
  for (const key of SIDE_CARDS) if (cards[key]) side.append(cards[key]);
  return side;
}
