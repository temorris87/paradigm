// THE field table: the label over each text box on a page, by kind of note, and the hint an
// empty one shows. A meeting has two: its agenda, then its notes (the minutes). Pure.
//
//   fieldsFor(note, inHub)   { main: { label, hint }, agenda?: { label, hint } }
//                            inHub: the note is inside a project or an area (then
//                            text can become a question or decision)
const FROM_TEXT = "select text and right-click to add a question or decision";

export const FIELDS = {
  project: { main: { label: "Outcome", hint: "what done looks like" } },
  area: { main: { label: "Purpose", hint: "the standard this area keeps up" } },
  person: { main: { label: "Notes", hint: "anything worth remembering about them" } },
  meeting: {
    agenda: { label: "Agenda", hint: "what to cover" },
    main: { label: "Notes", hint: "lines starting T: D: Q: become a task, decision or question on save · @name assigns · !wed sets due" },
  },
  phase: { main: { label: "Notes", hint: "what this phase covers, and what done looks like for it" } },
  milestone: { main: { label: "Notes", hint: "what has to be true on this day" } },
  template: { main: { label: "Template", hint: "{{date}}, {{time}}, {{title}} are filled in; {{cursor}} is where the cursor goes; - [ ] lines become tasks" } },
  decision: { main: { label: "Why", hint: "why it was decided, and what else was weighed" } },
  question: { main: { label: "Answer", hint: "the discussion, and the answer once there is one" } },
};

export function fieldsFor(note, inHub = false) {
  return FIELDS[note?.kind] ?? { main: { label: "Notes", hint: inHub ? FROM_TEXT : "" } };
}
