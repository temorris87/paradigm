// The main window's dashboard of a hub or a person, over the card and sections HubPage draws:
// a project's or an area's head (dash-head.js: name, health, Outcome, Log status), a
// project's Plan strip (plan-strip.js; gp opens the full chart, plan/plan-page.js), and its
// text, rendered (the note window edits it: Edit ↗). A project's or area's text shows in full
// only past its first line, which the head already shows.
//
//   const dashboard = new Dashboard({ head, strip, text });   text: { box, label, body, edit, more }
//   dashboard.attach(app)      the NotesApp it works for (its plan, commands, renderer)
//   dashboard.show(ctx, note, body, pageShown)    after every redraw
//   dashboard.hasChart / dashboard.focus()        never a chart here now (kept for the app)
import { drawDiagrams } from "../diagrams/mermaid.js";
import { renderMarkdown } from "../markdown/index.js";
import { ensureMathFonts, typesetMath } from "../math/typeset.js";
import { isHub, isPerson } from "../notes/hub-groups.js";
import { copyDigest, logStatusDialog } from "../status/status-commands.js";
import { startOneOnOne } from "../people/topic-commands.js";
import { DashHead } from "./dash-head.js";
import { fieldsFor } from "./fields.js";
import { PlanStrip } from "./plan-strip.js";
import { applyTemplateDialog, newPhaseDialog } from "../plan/plan-commands.js";

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
    this.head = new DashHead(head, {
      onLog: (note) => run(() => logStatusDialog(this.app, note)),
      onDigest: (note) => run(() => copyDigest(this.app, note)),
      onEdit: (note) => run(() => this.app.openInNoteWindow(note.id)),
      onOneOnOne: (person) => run(() => startOneOnOne(this.app, person)),
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
    text.body.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !url.searchParams.has("note")) return;
      event.preventDefault();
      this.app.guard(this.app.open(Number(url.searchParams.get("note"))));
    });
  }

  attach(app) {
    this.app = app;
  }

  show(ctx, note, body, pageShown) {
    const shown = Boolean(note) && !pageShown && (isHub(ctx.tree, note.id) || isPerson(ctx.tree, note.id));
    this.note = shown ? note : null;
    this.head.show(ctx, shown ? note : null, body);
    this.strip.show(ctx, shown ? note : null);
    // A hub's head shows its first line; the text box only when there is more than that.
    const headed = shown && (note.kind === "project" || note.kind === "area");
    const more = body.trim().split("\n").filter((line) => line.trim()).length > 1;
    this.text.box.hidden = !shown || (headed && !more);
    if (this.text.box.hidden) return;
    const fields = fieldsFor(note);
    this.text.label.textContent = fields.main.label;
    this.text.body.innerHTML = body.trim() ? renderMarkdown(body, this.app.markdownOptions())
      : `<p class="dash-text__empty">${escapeHtml(fields.main.hint || "Nothing written yet")}: Edit ↗ to write it</p>`;
    for (const link of this.text.body.querySelectorAll("a")) link.tabIndex = -1;
    // The renderer leaves maths and diagrams as placeholders; draw them as the editor does.
    ensureMathFonts();
    typesetMath(this.text.body);
    drawDiagrams(this.text.body);
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

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
