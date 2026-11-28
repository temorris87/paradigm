// THE table of note commands typed in the editor after ":" (and in the palette, which lists
// them by label with their keys). The editor knows only their names (addExCommand); running
// one sends an "ex" event, and the page runs it here. Names that Vim already uses for
// something else (:delete, :move, :sub...) are avoided. noteOnly: needs the editor (the note
// window); the main window's palette leaves it out. onNote: acts on "this note", the one on
// screen (screen-note.js): refused on a main-window page that shows none.
import { HUB_GROUPS, isDecisionOrQuestion } from "./hub-groups.js";
import { openPalette } from "../palette/palette.js";
import { attendeeCommand, dateCommand, dropAttendeeCommand, newMeetingCommand } from "../meetings/meetings-commands.js";
import { answeredCommand, dropWithCommand, newRecordCommand, recordDateCommand, reopenCommand,
  withCommand } from "../records/records-commands.js";
import { addPersonCommand, dropPersonCommand, fieldCommand, newPersonCommand } from "../people/people-commands.js";
import { quickTaskCommand, taskCommand } from "../tasks/task-commands.js";
import { attachCommand } from "../tasks/task-emails.js";
import { statusCommand } from "../status/status-commands.js";
import { insertTemplateDialog } from "../templates/template-commands.js";
import { insertTableDialog } from "./selection-menu.js";
import { insertDiagramDialog } from "../diagrams/insert-diagram.js";
import { refusalOf, screenNoteId } from "./screen-note.js";

// :project :area :resource :inbox, typed in full (:res is Vim's :resize, :ar is :args).
const FILING_COMMANDS = HUB_GROUPS.map((group) => ({
  name: group.command,
  onNote: true,
  label: group.kind ? `File as ${group.asWhat}` : "Back to the Inbox",
  min: group.command.length,
  usage: `:${group.command}`,
  help: group.kind
    ? `file this note as ${group.asWhat} (a note inside another moves to the top level)`
    : "put this note back in the Inbox (a note inside another moves to the top level)",
  run: (app) => app.kindCommand(group),
}));
export const NOTE_COMMANDS = [
  { name: "edit", label: "Open a note…", min: 1, usage: ":e[dit][!] {note}", help: "open a note (:e! drops unsaved changes; with no note, reloads this one)",
    run: (app, { arg, bang }) => app.editCommand(arg, bang) },
  { name: "new", onNote: true, label: "New note beside…", min: 3, usage: ":new {title}", help: "make a note beside this one and open it",
    run: (app, { arg }) => app.createCommand(arg, "beside") },
  { name: "child", onNote: true, label: "New note under…", min: 5, usage: ":child {title}", help: "make a note under this one and open it",
    run: (app, { arg }) => app.createCommand(arg, "under") },
  { name: "rename", onNote: true, label: "Rename…", min: 6, usage: ":rename {title}", help: "rename this note",
    run: (app, { arg }) => app.renameCommand(arg) },
  { name: "parent", onNote: true, label: "Move under another note…", min: 6, usage: ":parent {note} | /", help: "put this note under another note (/ for the top level)",
    run: (app, { arg }) => app.parentCommand(arg) },
  { name: "find", label: "Go to a note…", min: 3, usage: ":fin[d] [{text}]", help: "the palette: a note to open from every note, narrowed by the text",
    run: (app, { arg }) => openPalette(app, arg.trim()) },
  { name: "nav", label: "Notes tree", min: 3, usage: ":nav", help: "go to the notes tree (on a narrow window it slides in)",
    run: (app) => app.navCommand() },
  ...FILING_COMMANDS,
  { name: "inarea", onNote: true, label: "Put in an area…", min: 6, usage: ":inarea [{area}]", help: "put this project in an area (with no area: take it out)",
    run: (app, { arg }) => app.inAreaCommand(arg) },
  { name: "archive", onNote: true, label: "Archive", min: 4, usage: ":arch[ive]", help: "archive this hub with every note in it (it moves to the Archive group)",
    run: (app) => app.archiveCommand() },
  { name: "restore", onNote: true, label: "Restore from the Archive", min: 5, usage: ":resto[re]", help: "bring this archived hub back to its group",
    run: (app) => app.restoreCommand() },
  { name: "home", label: "Today", min: 4, usage: ":home", help: "open Today (Escape comes back to the note)",
    run: (app) => app.showView("home", "push") },
  { name: "today", label: "Today", min: 5, usage: ":today", help: "open Today: now, the day, Up next, projects, the Inbox",
    run: (app) => app.showView("home", "push") },
  { name: "week", label: "Week", min: 4, usage: ":week", help: "open the Week: plan it, the timesheet",
    run: (app) => app.calendarCommand() },
  { name: "live", label: "Live note", min: 4, usage: ":live", help: "show the note window's note in the main window, rendered as it is typed",
    run: (app) => app.showView("live", "push") },
  // Typed in full: :set is the editor's options.
  { name: "settings", label: "Settings", min: 8, usage: ":settings", help: "open Settings: the note window, codes and hours, holidays, time off, linked folders, the data folder",
    run: (app) => app.showView("settings", "push") },
  { name: "people", label: "People", min: 6, usage: ":people", help: "open the People page (Escape comes back to the note)",
    run: (app) => app.showView("people", "push") },
  { name: "newperson", label: "New person…", min: 9, usage: ":newperson {name}", help: "add a person to People and open their note",
    run: (app, { arg }) => newPersonCommand(app, arg) },
  { name: "addperson", onNote: true, label: "Add a person to this hub…", min: 9, usage: ":addperson[!] {name}[, {role}]", help: "put a person on this hub with a role, or change the role (! adds someone new to People)",
    run: (app, { arg, bang }) => addPersonCommand(app, arg, bang) },
  { name: "dropperson", onNote: true, label: "Take a person off this hub…", min: 10, usage: ":dropperson {name}", help: "take a person off this hub (they stay in People)",
    run: (app, { arg }) => dropPersonCommand(app, arg) },
  { name: "org", onNote: true, label: "Set organisation…", min: 3, usage: ":org [{organisation}]", help: "set this person's organisation (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "org", arg) },
  { name: "job", onNote: true, label: "Set job title…", min: 3, usage: ":job [{job title}]", help: "set this person's job title (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "job", arg) },
  { name: "email", onNote: true, label: "Set email…", min: 5, usage: ":email [{address}]", help: "set this person's email (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "email", arg) },
  { name: "phone", onNote: true, label: "Set phone…", min: 5, usage: ":phone [{number}]", help: "set this person's phone number (with nothing: clear it)",
    run: (app, { arg }) => fieldCommand(app, "phone", arg) },
  { name: "meetings", label: "Meetings", min: 8, usage: ":meetings", help: "open the Meetings page (Escape comes back to the note)",
    run: (app) => app.showView("meetings", "push") },
  { name: "meeting", onNote: true, label: "New meeting…", min: 7, usage: ":meeting [{date}] [{time}] {title}", help: "make a meeting in this hub, titled \"{date} {title}\" (date: 2026-11-24, today, tomorrow, yesterday; today if left out)",
    run: (app, { arg }) => newMeetingCommand(app, arg) },
  { name: "date", onNote: true, label: "Change the date…", min: 4, usage: ":date {date} [{time}]", help: "set this meeting's date and time (no time: none; a title starting with the old date gets the new one), or a decision's or question's date",
    run: (app, { arg }) => (isDecisionOrQuestion(app.tree, screenNoteId(app)) ? recordDateCommand(app, arg) : dateCommand(app, arg)) },
  { name: "attendee", onNote: true, label: "Add attendees…", min: 8, usage: ":attendee[!] {name}[, {name}...]", help: "these people attended this meeting (! adds someone new to People)",
    run: (app, { arg, bang }) => attendeeCommand(app, arg, bang) },
  { name: "dropattendee", onNote: true, label: "Remove an attendee…", min: 12, usage: ":dropattendee {name}", help: "this person did not attend this meeting after all",
    run: (app, { arg }) => dropAttendeeCommand(app, arg) },
  { name: "decision", onNote: true, label: "New decision…", min: 8, usage: ":decision [{date}] {title}", help: "record a decision in this hub, or from this meeting (dated today, or the meeting's day)",
    run: (app, { arg }) => newRecordCommand(app, "decision", arg) },
  { name: "question", onNote: true, label: "New question…", min: 8, usage: ":question [{date}] {title}", help: "record an open question in this hub, or from this meeting",
    run: (app, { arg }) => newRecordCommand(app, "question", arg) },
  { name: "answered", onNote: true, label: "Mark answered", min: 8, usage: ":answered [{date}]", help: "this question is answered (today if no date); write the answer in its note",
    run: (app, { arg }) => answeredCommand(app, arg) },
  { name: "reopen", onNote: true, label: "Reopen the question", min: 6, usage: ":reopen", help: "this answered question is open again",
    run: (app) => reopenCommand(app) },
  { name: "with", onNote: true, label: "Add people to this record…", min: 4, usage: ":with[!] {name}[, {name}...]", help: "these people are on this decision or question (! adds someone new to People)",
    run: (app, { arg, bang }) => withCommand(app, arg, bang) },
  { name: "dropwith", onNote: true, label: "Take a person off this record…", min: 8, usage: ":dropwith {name}", help: "take a person off this decision or question",
    run: (app, { arg }) => dropWithCommand(app, arg) },
  { name: "task", onNote: true, label: "New task…", min: 4, usage: ":task [!]{text}", help: "add a task to this note's Tasks (! in front: due today)",
    run: (app, { arg }) => taskCommand(app, arg) },
  { name: "t", onNote: true, label: "Quick task…", min: 1, usage: ":t {text} [@Name] [!day]",
    help: "a task on this note's hub without leaving the note (a name first: theirs to do; later: you owe them; !fri: due)",
    run: (app, { arg }) => quickTaskCommand(app, arg) },
  { name: "attach", label: "Attach an email (.msg)…", min: 3, usage: ":att[ach]", help: "on a task's page: attach Outlook emails (.msg files), as a drop onto the page does",
    run: (app) => attachCommand(app) },
  { name: "template", label: "Insert template…", noteOnly: true, min: 8, usage: ":template [{name}]", help: "put a template's text in below the cursor (its - [ ] lines become tasks)",
    run: (app, { arg }) => insertTemplateDialog(app, arg.trim()) },
  { name: "diagram", label: "Insert diagram…", noteOnly: true, min: 4, usage: ":diag[ram]", help: "pick a Mermaid diagram type: its block goes in below the cursor, ‹blanks› to fill with Tab",
    run: (app) => insertDiagramDialog(app.editor, () => app.focusNote()) },
  // The editor runs these itself when typed (table-edit.js); the palette runs them here.
  { name: "table", label: "Insert table…", noteOnly: true, min: 5, usage: ":table [{columns} [{rows}]]", help: "an empty table below the cursor (rows count the header); Tab, Enter move between cells",
    run: (app, { arg }) => (arg.trim() ? app.editor.tableCommand("table", arg.trim()) : insertTableDialog(app.editor, () => app.focusNote())) },
  { name: "tsort", label: "Sort the table", noteOnly: true, min: 5, usage: ":tsort[!] [{column}]", help: "sort the table's rows by the cursor's column, or one by number or header (again: the other way; ! down)",
    run: (app, { arg, bang }) => app.editor.tableCommand("tsort", bang ? "!" : arg.trim()) },
  { name: "talign", label: "Align a table column", noteOnly: true, min: 6, usage: ":talign left|center|right", help: "align the table column under the cursor",
    run: (app, { arg }) => app.editor.tableCommand("talign", arg.trim()) },
  { name: "tcopy", label: "Copy table", noteOnly: true, min: 5, usage: ":tcopy", help: "copy the table under the cursor for Word, Outlook or Teams (formatted) and Excel (cells)",
    run: (app) => app.editor.tableCommand("tcopy") },
  { name: "dashboard", onNote: true, label: "Show on the dashboard", min: 4, usage: ":dash[board]", help: "show this note's hub on the dashboard (the main window)",
    run: (app) => app.dashboardCommand() },
  { name: "log", onNote: true, label: "Log status…", min: 3, usage: ":log[!]", help: "Log status… of this note's project or area: health and where it is (:log! its history)",
    run: (app, { bang }) => statusCommand(app, { bang }) },
  { name: "plan", label: "Plan (Gantt chart)", min: 4, usage: ":plan", help: "show the full plan of this note's project or area (its Gantt chart) in the main window",
    run: (app) => app.showPlan() },
  { name: "timecode", onNote: true, label: "Set time code…", min: 8, usage: ":timecode [{code}]", help: "set this project's or area's timesheet code (with nothing: clear it)",
    run: (app, { arg }) => app.setTimeCode(screenNoteId(app), arg.trim()) },
  { name: "calendar", label: "Week", min: 3, usage: ":cal[endar]", help: "show the Week's plan in the main window",
    run: (app) => app.calendarCommand() },
  { name: "time", label: "Timesheet", min: 4, usage: ":time", help: "show the Week's timesheet in the main window",
    run: (app) => app.timeCommand() },
  { name: "oncall", label: "On call", min: 6, usage: ":oncall", help: "show the on-call rota (the Week's On call) in the main window; paste the Excel sheet there",
    run: (app) => app.onCallCommand() },
  { name: "hub", label: "Go to the sections", min: 3, usage: ":hub", help: "go to the sections (in the note window: open their sheet)",
    run: (app) => app.hubCommand() },
  { name: "export", onNote: true, label: "Export as a web page", min: 3, usage: ":exp[ort]", help: "download this note, and the linked notes beside or under it, as one .html file",
    run: (app) => app.exportCommand() },
  { name: "trash", onNote: true, label: "Move to trash", min: 5, usage: ":trash[!]", help: "move this note to the Trash (:trash! with the notes under it)",
    run: (app, { bang }) => app.trashCommand(bang) },
  { name: "trashed", label: "Trash", min: 7, usage: ":trashed", help: "open the Trash page: notes trashed in the last week, to restore (Escape comes back to the note)",
    run: (app) => app.showView("trash", "push") },
];

export function registerNoteCommands(editor) {
  for (const { name, min } of NOTE_COMMANDS) editor.addExCommand(name, min);
}

export function runNoteCommand(app, { name, arg, bang }) {
  const command = NOTE_COMMANDS.find((each) => each.name === name);
  // A rejection, not a throw: callers hand the result to app.guard, which shows it.
  const refusal = command?.onNote ? refusalOf(app) : "";
  if (refusal) return Promise.reject(new Error(refusal));
  return command ? command.run(app, { arg: arg ?? "", bang: Boolean(bang) }) : undefined;
}
