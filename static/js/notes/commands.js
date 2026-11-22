// THE table of note commands typed in the editor after ":". The editor knows only their
// names (addExCommand); running one sends an "ex" event, and the page runs it here. Names
// that Vim already uses for something else (:delete, :move, :sub...) are avoided.
import { HUB_GROUPS } from "./hub-groups.js";
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
  { name: "nav", min: 3, usage: ":nav", help: "go to the notes tree (on a narrow window it slides in)",
    run: (app) => app.navCommand() },
  ...FILING_COMMANDS,
  { name: "inarea", min: 6, usage: ":inarea [{area}]", help: "put this project in an area (with no area: take it out)",
    run: (app, { arg }) => app.inAreaCommand(arg) },
  { name: "archive", min: 4, usage: ":arch[ive]", help: "archive this hub with every note in it (it moves to the Archive group)",
    run: (app) => app.archiveCommand() },
  { name: "restore", min: 5, usage: ":resto[re]", help: "bring this archived hub back to its group",
    run: (app) => app.restoreCommand() },
  { name: "people", min: 6, usage: ":people", help: "open the People page (Escape comes back to the note)",
    run: (app) => app.peopleCommand() },
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
  { name: "hub", min: 3, usage: ":hub", help: "go to the hub's section panel (opens it if collapsed)",
    run: (app) => app.hubCommand() },
  { name: "export", min: 3, usage: ":exp[ort]", help: "download this note, and the linked notes beside or under it, as one .html file",
    run: (app) => app.exportCommand() },
  { name: "trash", min: 5, usage: ":trash[!]", help: "delete this note (:trash! with the notes under it)",
    run: (app, { bang }) => app.trashCommand(bang) },
];

export function registerNoteCommands(editor) {
  for (const { name, min } of NOTE_COMMANDS) editor.addExCommand(name, min);
}

export function runNoteCommand(app, { name, arg, bang }) {
  const command = NOTE_COMMANDS.find((each) => each.name === name);
  return command ? command.run(app, { arg: arg ?? "", bang: Boolean(bang) }) : undefined;
}
