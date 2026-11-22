// The menu on a right-click in the text (or Shift-F10, the Menu key): make a question or a
// decision from the selected text. The record goes in the note's hub and remembers the note
// and the text; the note stays open, and the text gets a badge (highlights in <pd-editor>).
//
//   openSelectionMenu(app, { text, x, y }, editor)   from the editor's "menu" event
//   recordFromSelectionDialog(app, kind, sourceId, text)
//   titleFromSelection(text)    the selection as a one-line note title (pure)
import { localDay } from "../meetings/meeting-days.js";
import { hubOf, isMeeting, meetingOf } from "./hub-groups.js";
import { MENTION, trimName } from "../markdown/mentions.js";
import { plainWords } from "../editor/highlights.js";
import { personForMention } from "./mentions.js";
import { peopleNamed } from "../people/people-commands.js";
import { allPeople } from "../people/people-model.js";
import { recordFromText } from "../records/records-commands.js";
import { formDialog } from "../ui/dialog.js";
import { openMenu } from "../ui/menu.js";

const KINDS = [
  { kind: "question", label: "Add question…", heading: "New question", field: "The question" },
  { kind: "decision", label: "Add decision…", heading: "New decision", field: "What was decided" },
];
const MAX_TITLE = 200;

export function openSelectionMenu(app, { text, x, y }, editor) {
  const sourceId = app.currentId;
  const hub = sourceId === null ? null : hubOf(app.tree, sourceId);
  const why = !hub ? "File this note in a project or area first" : !text?.trim() ? "Select text first (drag over it, or v)" : "";
  openMenu(pointAnchor(x, y, editor), KINDS.map(({ kind, label }) => ({
    label,
    disabled: Boolean(why),
    hint: why,
    run: () => app.guard(recordFromSelectionDialog(app, kind, sourceId, text)),
  })), { label: "Selected text" });
}

export function recordFromSelectionDialog(app, kind, sourceId, text) {
  const { heading, field } = KINDS.find((each) => each.kind === kind);
  const tree = app.tree;
  const source = tree.get(sourceId);
  const hub = hubOf(tree, sourceId);
  const meeting = isMeeting(tree, sourceId) ? source : meetingOf(tree, sourceId);
  const where = [`Goes to ${hub.title}`, source.id !== hub.id ? `from ${meeting?.title ?? source.title}` : ""].filter(Boolean).join(", ");
  const day = (meeting ? app.meetings.get(meeting.id).day : "") || localDay(app.today());
  return formDialog({
    title: heading,
    text: where,
    fields: [
      { key: "title", label: field, value: titleFromSelection(text) },
      { key: "day", label: kind === "decision" ? "Decided on" : "Asked on", type: "date", value: day },
      { key: "people", label: "People (names, with commas)", optional: true, value: mentionedPeople(tree, text).join(", "),
        suggestions: allPeople(tree).map((person) => person.title) },
    ],
    submit: kind === "decision" ? "Add decision" : "Add question",
    run: async (values) => {
      // The quote is checked against the saved text: what was typed goes first.
      await app.session.save();
      await app.agenda?.save();
      const names = values.people.split(",").map((name) => name.trim()).filter(Boolean);
      const { people } = names.length ? await peopleNamed(app, names, false, "") : { people: [] };
      await recordFromText(app, kind, sourceId, values.title.trim(), values.day, text.trim(), people.map((person) => person.id));
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export function titleFromSelection(text) {
  const words = String(text ?? "").split("\n").map(plainWords).filter(Boolean).join(" ")
    .replace(/[/|]/g, "-").replace(/[#[\]]/g, "").replace(/\s+/g, " ").trim();
  return words.length > MAX_TITLE ? words.slice(0, MAX_TITLE - 1).trimEnd() + "…" : words;
}

/** The people @mentioned in the text, by their note titles. */
function mentionedPeople(tree, text) {
  const found = new Set();
  MENTION.lastIndex = 0;
  for (let match = MENTION.exec(text ?? ""); match; match = MENTION.exec(text ?? "")) {
    const person = personForMention(tree, trimName(match[2]));
    if (person) found.add(person.title);
  }
  return [...found];
}

// openMenu places a menu under a button; here it goes at a point in the text.
function pointAnchor(x, y, editor) {
  return {
    getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }),
    setAttribute() {},
    contains: () => false,
    focus: () => editor.focus(),
  };
}
