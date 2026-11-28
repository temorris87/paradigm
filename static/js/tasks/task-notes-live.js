// The task page's half of a task's notes in the note window (031): while the note window holds
// this task's notes (tasks/task-notes-session.js), the Notes card's head shows the chip
// "Live · editing in the note window" left of Edit, and the card renders the notes as they are
// typed, with the caret where the cursor is (live/caret.js). The note window sends
// { type: "live", task, title, text, caret: { line, col, mode } } (live/live-sender.js) and
// { type: "live-closed", task } as it leaves them or closes; a task page opened later asks
// with "live-ask".
//
//   liveTaskState(state, message)   the next state: null, or { task, title, text, caret }; pure
//   isLiveFor(state, taskId)        whether the note window holds that task's notes; pure
//   LIVE_CHIP                       the chip's words
//
//   const live = new TaskNotesLive({ changes, onClosed(taskId) })
//   live.ask()                      "live-ask": what the note window holds, answered at once
//   live.attach(view)               view: { taskId, head, edit, body, render(markdown) -> html }
//                                   the Notes card as drawn (task-page.js); live text and the
//                                   chip go into it, again on every message
//   live.text(taskId)               the live text, or null when the notes are not open there
import { placeCaret } from "../live/caret.js";
import { coverNextCharacter, swapCaret } from "../live/live-page.js";
import { chip } from "../ui/chip.js";
import { drawRendered } from "../ui/rendered-text.js";

export const LIVE_CHIP = "Live · editing in the note window";

export function liveTaskState(state, message) {
  if (message?.type === "live") {
    // A plain note in the note window: no task's notes are open there.
    if (message.task === undefined || message.task === null) return null;
    return { task: message.task, title: message.title ?? "", text: String(message.text ?? ""), caret: message.caret ?? null };
  }
  if (message?.type === "live-closed") {
    // Without task: the note window went (a note's pagehide), so nothing is open there.
    if (message.task === undefined || message.task === state?.task) return null;
  }
  return state;
}

export function isLiveFor(state, taskId) {
  return state !== null && state !== undefined && taskId !== null && taskId !== undefined && state.task === taskId;
}

export class TaskNotesLive {
  constructor({ changes, onClosed = () => {} }) {
    this.changes = changes;
    this.onClosed = onClosed;
    this.state = null;
    this.view = null;
    changes?.listen((message) => this.receive(message));
  }

  ask() {
    this.changes?.send({ type: "live-ask" });
  }

  text(taskId) {
    return isLiveFor(this.state, taskId) ? this.state.text : null;
  }

  receive(message) {
    if (message?.type !== "live" && message?.type !== "live-closed") return;
    const was = this.state;
    this.state = liveTaskState(was, message);
    const taskId = this.view?.taskId ?? null;
    if (isLiveFor(this.state, taskId)) this.draw();
    else if (isLiveFor(was, taskId)) {
      this.draw();
      this.onClosed(taskId);
    }
  }

  attach(view) {
    this.view = view;
    this.draw();
  }

  /** The chip, and the live text in the card's body; nothing to do while not live. */
  draw() {
    const view = this.view;
    if (!view) return;
    const live = isLiveFor(this.state, view.taskId);
    let mark = view.head.querySelector(".task-notes__live");
    if (live && !mark) {
      mark = chip(LIVE_CHIP, "info", { dot: true, title: "Its notes are open in the note window: what is typed there shows here" });
      mark.classList.add("task-notes__live");
      view.head.insertBefore(mark, view.edit ?? null);
    } else if (!live && mark) {
      mark.remove();
    }
    if (live) this.drawText(view);
  }

  drawText(view) {
    const { text, caret } = this.state;
    const placed = caret ? placeCaret(text, caret.line ?? 0, caret.col ?? 0, caret.mode) : null;
    const notes = document.createElement("div");
    notes.className = "task-page__notes md-doc";
    notes.innerHTML = view.render(placed ? placed.text : text);
    const shape = placed?.shape ?? "block";
    const mark = placed?.placed ? swapCaret(notes, shape) : null;
    if (mark && shape === "block") coverNextCharacter(mark);
    // Empty notes have no text to put the caret in: it shows on its own.
    if (!mark && caret && !text.trim()) {
      const empty = document.createElement("span");
      empty.className = `live-caret live-caret--${shape} live-caret--empty`;
      empty.setAttribute("aria-hidden", "true");
      (notes.lastElementChild ?? notes).append(empty);
    }
    // A card still being built: the page draws its maths and diagrams once it is in.
    const drawn = view.body.isConnected;
    view.body.replaceChildren(notes);
    if (drawn) drawRendered(notes);
  }
}
