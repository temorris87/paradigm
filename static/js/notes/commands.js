// THE table of note commands typed in the editor after ":". The editor knows only their
// names (addExCommand); running one sends an "ex" event, and the page runs it here. Names
// that Vim already uses for something else (:delete, :move, :sub...) are avoided.
import { HUB_GROUPS, isDecisionOrQuestion } from "./hub-groups.js";
import { goToNote } from "./note-actions.js";
import { attendeeCommand, dateCommand, dropAttendeeCommand, newMeetingCommand } from "../meetings/meetings-commands.js";
import { answeredCommand, dropWithCommand, newRecordCommand, recordDateCommand, reopenCommand,
  withCommand } from "../records/records-commands.js";
import { addPersonCommand, dropPersonCommand, fieldCommand, newPersonCommand } from "../people/people-commands.js";

// :project :area :resource :inbox, typed in full (:res is Vim's :resize, :ar is :args).
const FILING_COMMANDS = HUB_GROUPS.map((group) => ({
  name: group.command,
  min: group.command.length,
  usage: `:${group.command}`,
  help: group.kind
    ? `file this note as ${group.asWhat} (a note inside another moves to the top level)`
    : "put this note back in the Inbox (a note inside another moves to the top level)",
  run: (app) => app.kindCommand(group),
}));
export const NOTE_COMMANDS = [
  { name: "edit", min: 1, usage: ":e[dit][!] {note}", help: "open a note (:e! drops unsaved changes; with no note, reloads this one)",
    run: (app, { arg, bang }) => app.editCommand(arg, bang) },
  { name: "new", min: 3, usage: ":new {title}", help: "make a note beside this one and open it",
    run: (app, { arg }) => app.createCommand(arg, "beside") },
  { name: "child", min: 5, usage: ":child {title}", help: "make a note under this one and open it",
    run: (app, { arg }) => app.createCommand(arg, "under") },
  { name: "rename", min: 6, usage: ":rename {title}", help: "rename this note",
    run: (app, { arg }) => app.renameCommand(arg) },
  { name: "parent", min: 6, usage: ":parent {note} | /", help: "put this note under another note (/ for the top level)",
    run: (app, { arg }) => app.parentCommand(arg) },
  { name: "find", min: 3, usage: ":fin[d] [{text}]", help: "pick a note to open from every note, narrowed by the text",
    run: (app, { arg }) => goToNote(app, arg.trim()) },
  { name: "nav", min: 3, usage: ":nav", help: "go to the notes tree (on a narrow window it slides in)",
    run: (app) => app.navCommand() },
  ...FILING_COMMANDS,
  { name: "inarea", min: 6, usage: ":inarea [{area}]", help: "put this project in an area (with no area: take it out)",
    run: (app, { arg }) => app.inAreaCommand(arg) },
  { name: "archive", min: 4, usage: ":arch[ive]", help: "archive this hub with every note in it (it moves to the Archive group)",
    run: (app) => app.archiveCommand() },
  { name: "restore", min: 5, usage: ":resto[re]", help: "bring this archived hub back to its group",
    run: (app) => app.restoreCommand() },
  { name: "home", min: 4, usage: ":home", help: "open the Home page: today, open questions, projects, the Inbox (Escape comes back to the note)",
    run: (app) => app.showView("home", "push") },
  { name: "people", min: 6, usage: ":people", help: "open the People page (Escape comes back to the note)",
    run: (app) => app.showView("people", "push") },
  { name: "newperson", min: 9, usage: ":newperson {name}", help: "add a person to People and open their note",
    run: (app, { arg }) => newPersonCommand(app, arg) },
  { name: "addperson", min: 9, usage: ":addperson[!] {name}[, {role}]", help: "put a person on this hub with a role, or change the role (! adds someone new to People)",
    run: (app, { arg, bang }) => addPersonCommand(app, arg, bang) },
  { name: "dropperson", min: 10, usage: ":dropperson {name}", help: "take a person off this hub (they stay in People)",
    run: (app, { arg }) => dropPersonCommand(app, arg) },
  { name: "org", min: 3, usage: ":org [{organisation}]", help: "set this person's organisation (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "org", arg) },
  { name: "job", min: 3, usage: ":job [{job title}]", help: "set this person's job title (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "job", arg) },
  { name: "email", min: 5, usage: ":email [{address}]", help: "set this person's email (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "email", arg) },
  { name: "meetings", min: 8, usage: ":meetings", help: "open the Meetings page (Escape comes back to the note)",
    run: (app) => app.showView("meetings", "push") },
  { name: "meeting", min: 7, usage: ":meeting [{date}] [{time}] {title}", help: "make a meeting in this hub, titled \"{date} {title}\" (date: 2026-11-24, today, tomorrow, yesterday; today if left out)",
    run: (app, { arg }) => newMeetingCommand(app, arg) },
  { name: "date", min: 4, usage: ":date {date} [{time}]", help: "set this meeting's date and time (no time: none; a title starting with the old date gets the new one), or a decision's or question's date",
    run: (app, { arg }) => (isDecisionOrQuestion(app.tree, app.currentId) ? recordDateCommand(app, arg) : dateCommand(app, arg)) },
  { name: "attendee", min: 8, usage: ":attendee[!] {name}[, {name}...]", help: "these people attended this meeting (! adds someone new to People)",
    run: (app, { arg, bang }) => attendeeCommand(app, arg, bang) },
  { name: "dropattendee", min: 12, usage: ":dropattendee {name}", help: "this person did not attend this meeting after all",
    run: (app, { arg }) => dropAttendeeCommand(app, arg) },
  { name: "decision", min: 8, usage: ":decision [{date}] {title}", help: "record a decision in this hub, or from this meeting (dated today, or the meeting's day)",
    run: (app, { arg }) => newRecordCommand(app, "decision", arg) },
  { name: "question", min: 8, usage: ":question [{date}] {title}", help: "record an open question in this hub, or from this meeting",
    run: (app, { arg }) => newRecordCommand(app, "question", arg) },
  { name: "answered", min: 8, usage: ":answered [{date}]", help: "this question is answered (today if no date); write the answer in its note",
    run: (app, { arg }) => answeredCommand(app, arg) },
  { name: "reopen", min: 6, usage: ":reopen", help: "this answered question is open again",
    run: (app) => reopenCommand(app) },
  { name: "with", min: 4, usage: ":with[!] {name}[, {name}...]", help: "these people are on this decision or question (! adds someone new to People)",
    run: (app, { arg, bang }) => withCommand(app, arg, bang) },
  { name: "dropwith", min: 8, usage: ":dropwith {name}", help: "take a person off this decision or question",
    run: (app, { arg }) => dropWithCommand(app, arg) },
  { name: "hub", min: 3, usage: ":hub", help: "go to the hub's section panel (opens it if collapsed)",
    run: (app) => app.hubCommand() },
  { name: "export", min: 3, usage: ":exp[ort]", help: "download this note, and the linked notes beside or under it, as one .html file",
    run: (app) => app.exportCommand() },
  { name: "trash", min: 5, usage: ":trash[!]", help: "move this note to the Trash (:trash! with the notes under it)",
    run: (app, { bang }) => app.trashCommand(bang) },
  { name: "trashed", min: 7, usage: ":trashed", help: "open the Trash page: notes trashed in the last week, to restore (Escape comes back to the note)",
    run: (app) => app.showView("trash", "push") },
];

export function registerNoteCommands(editor) {
  for (const { name, min } of NOTE_COMMANDS) editor.addExCommand(name, min);
}

export function runNoteCommand(app, { name, arg, bang }) {
  const command = NOTE_COMMANDS.find((each) => each.name === name);
  return command ? command.run(app, { arg: arg ?? "", bang: Boolean(bang) }) : undefined;
}
