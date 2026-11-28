// The Week page's On call tab (&week=oncall): the rota pasted from the Excel sheet, a row per
// role and a column per week, the week shown lit; earlier weeks fold under "Earlier (n)".
// Ctrl-V on the tab, or Paste sheet…, reads the sheet (sheet.js) and asks before it saves;
// Clear rota… empties it. A name that is a person opens their dashboard. Each cell's Change…
// (or Enter on the cell) opens a dialog under it to put another name in that week and role (a
// replacement); a changed cell wears a "changed" chip, and an empty name puts the sheet's back.
// Its keys live in oncall-keys.js.
//
//   const page = new OnCallPage({ root, api, app, changes, onMove, today })
//     app(): the NotesApp (its tree, its rota, refreshTree, open, say)
//     onMove(days): the Week page moves the week (-7, 7, 0: this week)
//   page.show(); page.setMonday(monday); page.paste(text?)
import { confirmDialog, formDialog } from "../ui/dialog.js";
import { weekOf } from "../calendar/week-model.js";
import { localDay } from "../meetings/meeting-days.js";
import { dayText } from "../ui/dates.js";
import { chip } from "../ui/chip.js";
import { allPeople } from "../people/people-model.js";
import { parseSheet } from "./sheet.js";
import { cellPeople, changedTitle, pasteReplaces, pasteSummary, sheetName } from "./oncall-model.js";
import { onCallAction } from "./oncall-keys.js";

export class OnCallPage {
  constructor({ root, api, app, changes, onMove = () => {}, today = () => new Date() }) {
    this.root = root;
    this.api = api;
    this.app = app;
    this.changes = changes;
    this.today = today;
    this.onMove = onMove;
    this.monday = weekOf(localDay(today()));
    this.showEarlier = false;
    root.classList.add("oncall");
    root.addEventListener("keydown", (event) => this.onKey(event));
    // On the document: Firefox sends a paste outside a text box to the body, not the focus.
    root.ownerDocument.addEventListener("paste", (event) => {
      if (!this.shown() || event.target.closest?.("input, textarea, dialog, [contenteditable]")) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      event.preventDefault();
      this.paste(text);
    });
  }

  onKey(event) {
    const action = onCallAction(event);
    if (!action) return;
    event.preventDefault();
    switch (action) {
      case "previousWeek": return this.onMove(-7);
      case "nextWeek": return this.onMove(7);
      case "thisWeek": return this.onMove(0);
      case "paste": return this.app().guard(this.paste(""));
      case "change": return this.app().guard(this.change(event.target.dataset.week, event.target.dataset.role));
      case "earlier":
        this.showEarlier = !this.showEarlier;
        return this.draw();
    }
  }

  /** Whether the tab is on screen (the Week page and its On call tab both showing). */
  shown() {
    return !this.root.hidden && !this.root.closest("[hidden]");
  }

  setMonday(monday) {
    this.monday = monday;
    if (this.shown()) this.draw();
  }

  show() {
    this.draw();
  }

  focus() {
    this.root.focus({ preventScroll: true });
  }

  draw() {
    const app = this.app();
    const rota = app.onCall;
    const today = localDay(this.today());
    const thisWeek = weekOf(today);
    const earlier = rota.weeks.filter((week) => week < thisWeek);
    const weeks = this.showEarlier ? rota.weeks : rota.weeks.filter((week) => week >= thisWeek);
    const parts = [];
    if (rota.empty) {
      parts.push(element("p", "oncall__empty", "No rota yet. In Excel, copy the on-call sheet (Role, then one column per week) and paste it here with Ctrl-V, or use Paste sheet…"));
    } else {
      if (earlier.length) {
        const fold = button(this.showEarlier ? "Hide earlier weeks" : `Earlier (${earlier.length})`,
          "Weeks before this one (e)", () => {
            this.showEarlier = !this.showEarlier;
            this.draw();
          }, "cal-button oncall__earlier");
        parts.push(fold);
      }
      parts.push(weeks.length ? this.grid(app.tree, rota, weeks, today) : element("p", "oncall__empty", "Nothing from this week on: paste the next sheet."));
    }
    const foot = element("div", "oncall__foot");
    foot.append(element("span", "oncall__hint", "Paste the sheet here (Ctrl-V): a paste replaces the weeks it holds and keeps the rest."),
      button("Paste sheet…", "Paste the Excel sheet into a box, then save it (p)", () => this.paste(""), "cal-button oncall__paste"));
    if (!rota.empty) foot.append(button("Clear rota…", "Remove every week of the rota", () => this.clear(), "cal-button"));
    parts.push(foot);
    const focused = this.focusedCell();
    this.root.replaceChildren(...parts);
    this.refocus(focused);
  }

  /** Where the focus is in the tab before a redraw: its cell's week and role, or just "inside". */
  focusedCell() {
    const active = this.root.ownerDocument.activeElement;
    if (!active || active === this.root || !this.root.contains(active)) return null;
    const cell = active.closest(".oncall__cell[data-week]");
    return cell ? { week: cell.dataset.week, role: cell.dataset.role } : {};
  }

  // Any redraw (a save, the app's own redraw after it, ] [ t) replaces the cells: a focus left
  // on a removed one would fall to the body, where the tab's keys no longer reach.
  refocus(focused) {
    if (!focused) return;
    const cell = focused.week ? this.cellNode(focused.week, focused.role) : null;
    (cell ?? this.root).focus({ preventScroll: true });
  }

  grid(tree, rota, weeks, today) {
    const table = element("table", "oncall__grid");
    const head = element("tr");
    head.append(element("th", "oncall__role-head", "Role"));
    for (const week of weeks) {
      const cell = element("th", `oncall__week${week === this.monday ? " oncall__week--shown" : ""}`, dayText(week, { today }));
      if (week === weekOf(today)) cell.append(element("span", "oncall__now", " this week"));
      head.append(cell);
    }
    const thead = element("thead");
    thead.append(head);
    const body = element("tbody");
    for (const role of rota.roles()) {
      const row = element("tr");
      row.append(element("th", "oncall__role", role));
      for (const week of weeks) row.append(this.cell(tree, rota.cell(week, role), { week, role, today }));
      body.append(row);
    }
    table.append(thead, body);
    return table;
  }

  /** A role's cell in a week: its names, a "changed" chip, and Change… when the rota has it. */
  cell(tree, row, { week, role, today }) {
    const cell = element("td", `oncall__cell${week === this.monday ? " oncall__cell--shown" : ""}`);
    if (!row) return cell;
    cell.tabIndex = 0;
    cell.dataset.week = week;
    cell.dataset.role = role;
    const title = changedTitle(row);
    cellPeople(tree, row.name).forEach((part, index) => {
      if (index) cell.append(" / ");
      if (part.person) {
        // A changed name's hover says who the sheet had (its own title would hide the cell's);
        // a click still opens the person.
        const link = button(part.person.title, title || `Open ${part.person.title}`, () => this.app().guard(this.app().open(part.person.id)), "oncall__person");
        cell.append(link);
      } else cell.append(element("span", "oncall__name", part.text));
    });
    if (title) {
      cell.title = title;
      cell.append(" ", chip("changed", "info", { title }));
    }
    const change = button("✎", "Change… (Enter)", () => this.app().guard(this.change(week, role)), "oncall__change");
    change.setAttribute("aria-label", `Change ${role}, week of ${dayText(week, { today, weekday: false })}`);
    cell.append(change);
    return cell;
  }

  cellNode(week, role) {
    return [...this.root.querySelectorAll(".oncall__cell[data-week]")]
      .find((node) => node.dataset.week === week && node.dataset.role === role) ?? null;
  }

  /** Asks for another name in a role that week; "" (or the sheet's own) puts the sheet's back. */
  async change(week, role) {
    const app = this.app();
    const row = app.onCall.cell(week, role);
    if (!row) return;
    const anchor = this.cellNode(week, role);
    const day = dayText(week, { today: localDay(this.today()), weekday: false });
    const sheet = sheetName(row);
    const saved = await formDialog({
      title: `${role} · week of ${day}`,
      text: `On the sheet: ${sheet || "no one"}`,
      fields: [{ key: "name", label: "Name", value: row.name, optional: true,
        suggestions: allPeople(app.tree).map((person) => person.title), placeholder: "a name in People, or any name" }],
      live: () => ({ text: "Only this week and role change. Empty puts the sheet's name back.", plain: true }),
      submit: "Save",
      submitKey: "Enter",
      cancelKey: "Esc",
      anchor,
      returnFocus: anchor ?? this.root,
      run: async ({ name }) => {
        await this.api.set({ week, role, name: name.trim() });
        return { name: name.trim() };
      },
    });
    if (!saved) return;
    const back = !saved.name || saved.name === sheet;
    await this.saved(back ? `On call: ${role} · ${day} is the sheet's ${sheet || "no one"} again` : `On call: ${role} · ${day} is now ${saved.name}`);
    (this.cellNode(week, role) ?? this.root).focus({ preventScroll: true });
  }

  /** Asks before saving a pasted sheet (text: what was pasted; "" opens an empty box). */
  async paste(text) {
    const app = this.app();
    const today = this.today();
    const saved = await formDialog({
      title: "Paste the on-call sheet",
      text: "Copy the sheet in Excel: Role, then one column per week (a date in the header row). Each column is the week holding its date.",
      fields: [{ key: "sheet", label: "Sheet", type: "textarea", value: text, rows: 10,
        placeholder: "Role\t11/23\t11/30\nPrimary\tTom Reyes\tAna Kim" }],
      submit: "Save rota",
      live: ({ sheet }) => {
        if (!sheet.trim()) return "";
        const parsed = parseSheet(sheet, today);
        // A sheet that reads is a preview; one that doesn't is the warning.
        const text = pasteSummary(parsed, app.onCall, app.tree, localDay(today));
        if (parsed.problem) return text;
        // Changed names in the weeks it holds go back to the sheet's: said on a line of its own.
        const replaces = pasteReplaces(parsed, app.onCall, localDay(today));
        return { text: replaces ? `${text}\n${replaces}` : text, plain: true };
      },
      returnFocus: this.root,
      run: async ({ sheet }) => {
        const parsed = parseSheet(sheet, today);
        if (parsed.problem) throw new Error(parsed.problem);
        await this.api.paste(parsed.weeks);
        return parsed;
      },
    });
    if (!saved) return;
    await this.saved(`On call: ${saved.weeks.length} week${saved.weeks.length === 1 ? "" : "s"} saved`);
  }

  async clear() {
    const done = await confirmDialog({ title: "Clear the rota?", text: "Every week of the on-call rota goes. Paste the sheet again to bring it back.",
      confirm: "Clear rota", danger: true, returnFocus: this.root, run: async () => {
        await this.api.clear();
        return true;
      } });
    if (done) await this.saved("On call: the rota is cleared");
  }

  async saved(message) {
    const app = this.app();
    this.changes?.send({ type: "changed", what: ["oncall"] });
    await app.refreshTree();
    this.draw();
    app.say(message);
  }
}

function button(text, title, run, className) {
  const node = element("button", className, text);
  node.type = "button";
  node.title = title;
  node.addEventListener("click", run);
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
