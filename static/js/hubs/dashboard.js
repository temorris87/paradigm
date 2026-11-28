// The main window's dashboard of a hub or a person, over the card and sections HubPage draws:
// a project's or an area's head (dash-head.js: name, health, Log status; a project's facts
// row), a project's Plan strip (plan-strip.js; gp opens the full chart, plan/plan-page.js),
// and an area's or a person's text, rendered (the note window edits it: Edit ↗). An area's
// text shows in full only past its first line, which the head already shows; a project's is
// its Outcome section (hub-sections.js).
//
//   const dashboard = new Dashboard({ head, strip, text });   text: { box, label, body, edit, more }
//   dashboard.attach(app)      the NotesApp it works for (its plan, commands, renderer)
//   dashboard.show(ctx, note, body, pageShown)    after every redraw
//   focusFirst(app, controls)  the facts row's controls: focus back on the page, then the dialog
//   dashboard.hasChart / dashboard.focus()        never a chart here now (kept for the app)
import { renderMarkdown } from "../markdown/index.js";
import { drawRendered, followNoteLinks } from "../ui/rendered-text.js";
import { isHub, isPerson } from "../notes/hub-groups.js";
import { copyDigest, logStatusDialog } from "../status/status-commands.js";
import { startOneOnOne } from "../people/topic-commands.js";
import { DashHead } from "./dash-head.js";
import { fieldsFor } from "./fields.js";
import { PlanStrip } from "./plan-strip.js";
import { applyTemplateDialog, newPhaseDialog } from "../plan/plan-commands.js";
import { hubLineControls } from "./hub-actions.js";
import { openNoteMenu } from "../notes/note-actions.js";

// Past this height (rem) the rendered text folds under Show more.
const FOLD_REM = 24;

export class Dashboard {
  constructor({ head, strip, text }) {
    this.text = text;
    this.note = null;
    this.hasChart = false;
    this.app = null;
    // Some dialogs refuse at once (a throw, not a rejection): both go to the status line.
    const run = (work) => {
      try {
        this.app.guard(work());
      } catch (error) {
        this.app.fail(error);
      }
    };
    // A head button hands the focus back to the page first, so a dialog it opens returns
    // there on Esc and the list keys work again (not stuck on the button).
    const fromHead = (work) => {
      this.app.focusNote();
      run(work);
    };
    this.head = new DashHead(head, {
      onLog: (note) => fromHead(() => logStatusDialog(this.app, note)),
      onDigest: (note) => fromHead(() => copyDigest(this.app, note)),
      onEdit: (note) => run(() => this.app.openInNoteWindow(note.id)),
      onOneOnOne: (person) => fromHead(() => startOneOnOne(this.app, person)),
      onHistory: (project) => run(() => this.app.showHistory(project.id)),
      onMenu: (button) => run(() => openNoteMenu(this.app, button, { back: () => this.app.focusNote() })),
      controls: () => this.headControls,
    });
    this.strip = new PlanStrip(strip, {
      onOpen: (id) => run(() => this.app.open(id)),
      onPlan: () => run(() => this.app.showPlan(this.note?.id)),
      onAddPhase: () => run(() => newPhaseDialog(this.app, this.note)),
      onApplyTemplate: () => run(() => applyTemplateDialog(this.app, this.note)),
    });
    // Long text is folded under "Show more" (never a scroll box inside the scrolling page);
    // opened stays opened for that note until another note is shown.
    this.unfolded = null;
    text.more?.addEventListener("click", () => {
      this.unfolded = this.unfolded === this.note?.id ? null : this.note?.id;
      this.fold();
    });
    text.edit.addEventListener("click", () => this.note && this.app.guard(this.app.openInNoteWindow(this.note.id)));
    // A link in the rendered text opens like any other: a dashboard here, a note there.
    followNoteLinks(text.body, (id) => this.app.guard(this.app.open(id)));
  }

  attach(app) {
    this.app = app;
    // The facts row's buttons do what the card's do.
    this.controls = hubLineControls(app);
    // The facts row's buttons hand the focus back to the page first too (fromHead above):
    // a dialog they open returns to the list on Esc or Cancel, not to the button.
    this.headControls = focusFirst(app, this.controls);
  }

  show(ctx, note, body, pageShown) {
    const shown = Boolean(note) && !pageShown && (isHub(ctx.tree, note.id) || isPerson(ctx.tree, note.id));
    this.note = shown ? note : null;
    this.head.show(ctx, shown ? note : null, body);
    this.strip.show(ctx, shown ? note : null);
    // A hub's head shows its first line; the text box only when there is more than that.
    const headed = shown && (note.kind === "project" || note.kind === "area");
    const more = body.trim().split("\n").filter((line) => line.trim()).length > 1;
    this.text.box.hidden = !shown || (headed && !more) || note.kind === "project";
    if (this.text.box.hidden) return;
    const fields = fieldsFor(note);
    this.text.label.textContent = fields.main.label;
    this.text.body.innerHTML = body.trim() ? renderMarkdown(body, this.app.markdownOptions())
      : `<p class="dash-text__empty">${escapeHtml(fields.main.hint || "Nothing written yet")}: Edit ↗ to write it</p>`;
    drawRendered(this.text.body);
    this.fold();
  }

  fold() {
    const { body, more } = this.text;
    if (!more) return;
    const open = this.unfolded === this.note?.id;
    body.classList.remove("dash-text__body--folded");
    const tall = body.scrollHeight > FOLD_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
    body.classList.toggle("dash-text__body--folded", tall && !open);
    more.hidden = !tall;
    more.textContent = open ? "Show less" : "Show more";
  }

  focus() {}
}

/** The same controls, each handing the focus to the page (app.focusNote) before it runs. */
export function focusFirst(app, controls) {
  return Object.fromEntries(Object.entries(controls).map(([name, control]) => [name, (...args) => {
    app.focusNote();
    try {
      app.guard(control(...args));
    } catch (error) {
      app.fail(error);
    }
  }]));
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
