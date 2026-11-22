// What the note templates' buttons and :template do. A template is a note in the Templates
// group; putting it into a note adds its text below the cursor and makes its "- [ ]" boxes
// real tasks on the note (template-text.js).
//
//   newTemplateDialog(app)                  a new template, opened to write
//   insertTemplateDialog(app, query?)       a picker over the templates, then it goes in
//   insertTemplate(app, templateId)
//   templateChoices(tree)                   [[id, title]] for a Template dropdown (pure)
import { localDay } from "../meetings/meeting-days.js";
import { formDialog } from "../ui/dialog.js";
import { pickFrom } from "../ui/picker.js";
import { fillTemplate } from "./template-text.js";

export function templatesIn(tree) {
  return tree.children(null).filter((note) => note.kind === "template");
}

export function templateChoices(tree) {
  return templatesIn(tree).map((note) => [String(note.id), note.title]);
}

export function newTemplateDialog(app) {
  return formDialog({
    title: "New template",
    text: "Text to put into other notes: {{date}}, {{time}} and {{title}} are filled in, {{cursor}} is where the cursor goes, and each - [ ] line becomes a task.",
    fields: [{ key: "title", label: "Template name", placeholder: "Site visit, 1:1, Kick-off…" }],
    submit: "Make it",
    run: async ({ title }) => {
      const { note } = await app.templatesApi.create(title.trim(), `# {{title}}\n\n{{cursor}}\n`);
      await app.refreshTree();
      await app.open(note.id);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export async function insertTemplateDialog(app, query = "") {
  const templates = templatesIn(app.tree);
  if (!templates.length) throw new Error("E: no templates yet: make one with the + on the Templates group in the tree");
  const picked = await pickFrom({
    title: "Insert a template",
    placeholder: "part of the template's name",
    items: templates.map((note) => ({ id: note.id, title: note.title })),
    query,
    empty: "No template matches",
    fallbackFocus: () => app.focusNote(),
  });
  if (picked?.item) await insertTemplate(app, picked.item.id);
}

export async function insertTemplate(app, templateId) {
  const id = app.currentId;
  const note = app.tree.get(id);
  if (!note || app.role !== "note") throw new Error("E: open the note to put the template into first");
  if (note.kind === "template") throw new Error("E: this is a template: open the note it should go into");
  const template = await app.api.get(templateId);
  const now = app.today();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const { text, tasks, cursorAt } = fillTemplate(template.body, { date: localDay(now), time, title: note.title });
  if (text.trim() && !app.editor.value.trim()) {
    // An empty note becomes the template's text (no blank line left above it).
    app.editor.value = text;
    app.editor.dispatchEvent(new CustomEvent("change", { detail: { value: text } }));
    app.editor.goToLine(cursorAt ?? 0);
  } else if (text.trim()) {
    app.editor.insertLines(text, { cursorAt });
  }
  const made = [];
  for (const task of tasks) {
    const parentId = task.parent === null ? null : made[task.parent]?.id ?? null;
    const record = await app.tasksApi.create(id, task.title, { parentId });
    if (task.done) await app.tasksApi.setDone(record.id, true);
    made.push(record);
  }
  if (made.length) {
    app.changes.send({ type: "changed", what: ["tasks"] });
    await app.refreshTree();
  }
  app.editor.focus();
  app.say(`"${template.title}" put in${made.length ? `, with ${made.length} task${made.length === 1 ? "" : "s"}` : ""}`);
}

/** A new note under parentId with a template's text (and tasks) in it. */
export async function createFromTemplate(app, parentId, title, templateId) {
  const template = await app.api.get(templateId);
  const now = app.today();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const { text, tasks } = fillTemplate(template.body, { date: localDay(now), time, title });
  const note = await app.api.create(parentId, title, text);
  const made = [];
  for (const task of tasks) {
    const parent = task.parent === null ? null : made[task.parent]?.id ?? null;
    const record = await app.tasksApi.create(note.id, task.title, { parentId: parent });
    if (task.done) await app.tasksApi.setDone(record.id, true);
    made.push(record);
  }
  return note;
}
