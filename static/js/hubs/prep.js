// A meeting's Prep box (the note window, under its card): what to bring to it, from its
// attendees (meetings/prep-model.js): the open questions they are on, what they owe me (late
// ones first), and what happened last time. "Add all to agenda" puts them in the agenda.
//
//   const prep = new PrepBox(section, { onOpen(id), onAddAll(lines) });
//   prep.show(ctx, note)      note: a meeting, else the box hides
import { localDay } from "../meetings/meeting-days.js";
import { prepFor } from "../meetings/prep-model.js";
import { dayText } from "../ui/dates.js";

const SHOWN = 3;

export class PrepBox {
  constructor(root, { onOpen, onAddAll }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onAddAll = onAddAll;
  }

  show(ctx, note) {
    const meeting = note && ctx.meetings?.get(note.id);
    const prep = meeting && note.kind === "meeting" ? prepFor(ctx, note.id, ctx.today ?? new Date()) : null;
    const empty = !prep || (!prep.questions.length && !prep.waiting.length && !prep.last);
    this.root.hidden = empty;
    if (empty) return;
    const today = localDay(ctx.today ?? new Date());
    const head = element("div", "prep__head");
    head.append(element("span", "prep__title", "Prep"), element("span", "prep__detail", "open with the people in this meeting"));
    const lines = [...prep.questions.map(({ note: question }) => `- ${question.title}`),
      ...prep.waiting.map(({ task }) => `- ${task.title} (${ctx.tree.get(task.delegate_id)?.title ?? ""})`)];
    if (lines.length) {
      const add = element("button", "prep__add", "Add all to agenda");
      add.type = "button";
      add.addEventListener("click", () => this.onAddAll(lines));
      head.append(add);
    }
    const columns = element("div", "prep__columns");
    columns.append(
      this.column("question", prep.questions.slice(0, SHOWN).map(({ note: question, record }) => ({
        label: `Question · ${age(record.day, today)}`, title: question.title, id: question.id }))),
      this.column("waiting", prep.waiting.slice(0, SHOWN).map(({ task, note: where, late }) => ({
        label: `Waiting on ${firstName(ctx.tree.get(task.delegate_id))}${late ? ` · ${age(task.follow_up, today)} late` : ""}`,
        title: task.title, id: where.id, late }))),
      this.column("last", prep.last ? [{ label: `Last time · ${dayText(prep.last.meeting.day, { today })}`, id: prep.last.note.id,
        title: [prep.last.decisions.length ? `Decided ${prep.last.decisions.map((each) => each.title).join("; ")}` : "",
          prep.last.tasks ? `${prep.last.tasks} task${prep.last.tasks === 1 ? "" : "s"}, ${prep.last.done} done` : ""]
          .filter(Boolean).join(" · ") || "Nothing recorded" }] : []),
    );
    this.root.replaceChildren(head, columns);
  }

  column(kind, items) {
    const column = element("div", `prep__column prep__column--${kind}`);
    for (const item of items) {
      const row = element("button", `prep__item${item.late ? " prep__item--late" : ""}`);
      row.type = "button";
      row.append(element("span", "prep__label", item.label), element("span", "prep__text", item.title));
      row.addEventListener("click", () => this.onOpen(item.id));
      column.append(row);
    }
    return column;
  }
}

function age(day, today) {
  const days = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  return `${Math.max(0, days)} d`;
}

function firstName(person) {
  return person ? person.title.split(/\s+/)[0] : "someone";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
