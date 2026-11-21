// THE table of note commands typed in the editor after ":". The editor knows only their
// names (addExCommand); running one sends an "ex" event, and the page runs it here. Names
// that Vim already uses for something else (:delete, :move, :sub...) are avoided.
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
