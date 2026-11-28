// A task's Files card on its page (task-page.js): the files of the hubs' linked OneDrive folders
// linked to this task, one row each (a file icon, the name as a link that opens it, "OneDrive ·
// folder" on the right), + Add file… (file-commands.js addTaskFileDialog), and x unlinking one
// from the task (the file itself is left alone). The rows are options of the page's listbox;
// the page owns the selection and the keys, and hands a file row's actions here.
//
//   const files = new TaskFiles({ app: () => notesApp, redraw() });
//   files.sync(taskId, { force })   loads the task's files (another task, or the page's data read
//                                   again); nothing is fetched without app().tasksApi.files
//   files.rows()                    [{ file }], oldest added first
//   files.draw(option, { readOnly, hubId })   the card; option(node, file) makes a row an option
//   files.perform(action, file)     "open" | "openEmail" (o) | "remove"
//   files.add(task)                 + Add file…
import { addTaskFileDialog } from "../files/file-commands.js";
import { FILES_HINT, fileDetail } from "./task-page-model.js";
import { actionButton, card, element } from "./task-side.js";

export class TaskFiles {
  constructor({ app, redraw }) {
    this.app = app;
    this.redraw = redraw;
    this.taskId = null;
    this.list = [];
  }

  api() {
    const api = this.app().tasksApi;
    return api?.files ? api : null;
  }

  sync(taskId, { force = false } = {}) {
    if (taskId === this.taskId && !force) return;
    if (taskId !== this.taskId) this.list = [];
    this.taskId = taskId;
    if (this.api()) this.app().guard(this.load());
  }

  async load() {
    const taskId = this.taskId;
    const list = await this.api().files(taskId);
    // Another task's page may have come up while this one loaded.
    if (taskId !== this.taskId) return;
    const same = JSON.stringify(list) === JSON.stringify(this.list);
    this.list = list;
    if (!same) this.redraw();
  }

  rows() {
    return this.list.map((file) => ({ file }));
  }

  draw(option, { readOnly = false, hubId = null } = {}) {
    const add = readOnly ? null : actionButton("+ Add file…", "addFile", "Pick a file in the project's OneDrive folder");
    const node = card("files", "Files", this.list.length ? String(this.list.length) : "", add);
    if (!this.list.length) {
      node.append(element("p", "task-card__hint", readOnly ? "No files" : FILES_HINT));
      return node;
    }
    for (const file of this.list) node.append(option(this.row(file, hubId), file));
    return node;
  }

  row(file, hubId) {
    const node = element("div", `task-files__row${file.missing ? " task-files__row--missing" : ""}`);
    node.append(element("span", "task-files__icon", "▤"));
    const link = element("button", "task-files__name", file.name);
    link.type = "button";
    link.tabIndex = -1;
    link.title = file.missing ? "Not in its folder any more (moved or deleted in OneDrive)" : `Open it (Enter): ${file.rel_path ?? file.name}`;
    link.dataset.action = "openFile";
    node.append(link, element("span", "task-files__where", fileDetail(file, hubId)));
    return node;
  }

  perform(action, file) {
    switch (action) {
      case "open":
      case "openEmail":
      case "openFile": return this.open(file);
      case "remove": return this.detach(file);
      default: return undefined;
    }
  }

  async open(file) {
    if (file.missing) throw new Error(`E: "${file.name}" is not in its folder any more (moved or deleted in OneDrive)`);
    await this.app().filesApi.open(file.id);
    this.app().say(`Opening "${file.name}"…`);
  }

  async detach(file) {
    const taskId = this.taskId;
    await this.api().detachFile(taskId, file.id);
    this.list = this.list.filter((each) => each.id !== file.id);
    this.redraw();
    this.app().say(`"${file.name}" unlinked from the task (it stays in OneDrive)`);
  }

  async add(task) {
    const added = await addTaskFileDialog(this.app(), task);
    if (added?.file && task.id === this.taskId) await this.load();
  }
}
