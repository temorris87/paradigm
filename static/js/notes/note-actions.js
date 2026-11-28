// The note actions reached from the UI: the menu on the open note's crumb (note-menu.js), and
// the dialogs and pickers it opens (static/js/ui/). Each one ends in a NotesApp method, the same
// one the matching ex command runs (commands.js), so both ways behave alike.
//
//   openNoteMenu(app, anchorButton)
//   goToNote(app, query?)            the Go to picker (top bar, :find)
//   newNoteDialog(app, parentId, { heading?, kind? })   a title, then the new note opens
//   moveTargets(tree, id) / goToItems(tree, meetings?)  what the pickers list (pure)
import { confirmDialog, formDialog } from "../ui/dialog.js";
import { openMenu } from "../ui/menu.js";
import { pickFrom } from "../ui/picker.js";
import { groupOf, isHub, isRecordKind, RECORD_LABELS } from "./hub-groups.js";
import { localDay, whenText } from "../meetings/meeting-days.js";
import { noteMenuItems } from "./note-menu.js";
import { makePhaseDialog, unmakePhase } from "../plan/plan-commands.js";
import { createFromTemplate, insertTemplateDialog, templateChoices } from "../templates/template-commands.js";
import { moveToFolderDialog } from "../resources/folder-commands.js";
import { logStatusDialog } from "../status/status-commands.js";
import { hubLineControls } from "../hubs/hub-actions.js";
import { insertTableDialog } from "./selection-menu.js";

export function openNoteMenu(app, anchor) {
  const id = app.currentId;
  const entries = noteMenuItems(app.tree, id, { window: app.role }).map((item) => {
    if (item === "separator" || item.group && !item.key) return item;
    return { ...item, run: () => app.guard(runItem(app, id, item)) };
  });
  openMenu(anchor, entries, { label: "Note actions" });
}

function runItem(app, id, item) {
  const note = app.tree.get(id);
  switch (item.key) {
    case "logStatus": return logStatusDialog(app, note);
    case "area": return hubLineControls(app).area(note);
    case "status": return app.setProjectStatus(note.id, note.status === "on_hold" ? "active" : "on_hold").then(() => app.focusNote());
    case "rename": return formDialog({
      title: `Rename "${note.title}"`,
      fields: [{ key: "title", label: "Title", value: note.title }],
      submit: "Rename",
      run: ({ title }) => app.renameCommand(title),
      ...focusNote(app),
    });
    case "editDetails": return app.personDetails(id);
    case "move": return moveDialog(app, id);
    case "moveToFolder": return moveToFolderDialog(app, id);
    case "newBeside": return newNoteDialog(app, app.tree.parentId(id), { heading: `New note beside "${note.title}"` });
    case "newUnder": return newNoteDialog(app, id, { heading: `New note under "${note.title}"` });
    case "file": return app.kindCommand(item.filing).then(() => app.focusNote());
    case "archive": return app.archiveCommand().then(() => app.focusNote());
    case "restore": return app.restoreCommand().then(() => app.focusNote());
    case "export": return app.exportCommand().then(() => app.focusNote());
    case "trash": return trashDialog(app, note, item.inside);
    case "insertTemplate": return insertTemplateDialog(app);
    case "insertTable": return insertTableDialog(app.editor, () => app.focusNote());
    case "makePhase": return makePhaseDialog(app, note);
    case "unmakePhase": return unmakePhase(app, note);
    case "dashboard": return app.dashboardCommand();
  }
  return undefined;
}

export function newNoteDialog(app, parentId, { heading = "New note", kind = null, label = "Title", submit = "Make it" } = {}) {
  // A project or an area books time to a code (the timesheet); a project with none uses its area's.
  const coded = kind === "project" || kind === "area";
  // A plain note can start from a template (its text, and its - [ ] lines as tasks).
  const templates = kind ? [] : templateChoices(app.tree);
  return formDialog({
    title: heading,
    fields: [{ key: "title", label },
      ...(coded ? [{ key: "code", label: kind === "project" ? "Time code (optional: else its area's)" : "Time code (optional)",
        optional: true, placeholder: "the code on the timesheet" }] : []),
      ...(templates.length ? [{ key: "template", label: "Start from a template", type: "select", value: "",
        options: [["", "No template: an empty note"], ...templates] }] : [])],
    submit,
    run: ({ title, code = "", template = "" }) => {
      if (kind) return app.createFiled(kind, title, { timeCode: code.trim() });
      if (template) return app.createAndOpen(parentId, title, { strict: true, make: () => createFromTemplate(app, parentId, title, Number(template)) });
      return app.createAndOpen(parentId, title, { strict: true });
    },
    ...focusNote(app),
  });
}

async function moveDialog(app, id) {
  const note = app.tree.get(id);
  const picked = await pickFrom({
    title: `Move "${note.title}" under…`,
    placeholder: "part of a title or path",
    items: moveTargets(app.tree, id),
    ...focusNote(app),
  });
  if (picked?.item) await app.moveUnder(picked.item.id);
}

function trashDialog(app, note, inside) {
  const others = inside === 0 ? "" : ` and the ${inside === 1 ? "note" : `${inside} notes`} under it`;
  return confirmDialog({
    title: "Move to trash",
    text: `Move "${note.title}"${others} to the Trash? You can restore ${inside === 0 ? "it" : "them"} from the Trash for ${app.trash.days} days.`,
    confirm: "Move to trash",
    danger: true,
    run: () => app.trashCommand(true),
    ...focusNote(app),
  });
}

export async function goToNote(app, query = "") {
  const picked = await pickFrom({
    title: "Go to note",
    placeholder: "part of a title or path",
    items: goToItems(app.tree, app.meetings),
    query,
    empty: "No note matches",
    ...focusNote(app),
  });
  if (picked?.item) await app.open(picked.item.id);
}

/** Every note, in tree order, with where it is ("Projects › Acme"); then meetings, decisions
 * and questions. A meeting series (one hub, one name) is one item that opens the next one
 * (else the latest): "Meeting · 9 · next Tue 24 Nov 10:00 · Projects › Acme". */
export function goToItems(tree, meetings = null, today = new Date()) {
  const notes = [];
  const records = [];
  const series = new Map();
  for (const note of tree.inOrder()) {
    const where = whereText(tree, note.id);
    if (!isRecordKind(note.kind)) {
      notes.push({ id: note.id, title: note.title, detail: where });
    } else if (note.kind === "meeting" && meetings) {
      const key = `${tree.parentId(note.id)}\u0000${note.title.toLowerCase()}`;
      if (!series.has(key)) {
        series.set(key, { title: note.title, where, list: [] });
        records.push(series.get(key));
      }
      series.get(key).list.push({ id: note.id, meeting: meetings.get(note.id) });
    } else {
      records.push({ id: note.id, title: note.title, detail: [RECORD_LABELS[note.kind], where].join(" · ") });
    }
  }
  const day = localDay(today);
  return [...notes, ...records.map((item) => (item.list ? seriesItem(item, day, today) : item))];
}

function seriesItem({ title, where, list }, day, today) {
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time || "99:99"}`;
  const sorted = [...list].sort((a, b) => when(a).localeCompare(when(b)));
  const next = sorted.find((entry) => entry.meeting.day >= day && !entry.meeting.cancelled);
  const pick = next ?? sorted[sorted.length - 1];
  const count = list.length > 1 ? `${list.length} · ` : "";
  const label = `${next ? "next " : list.length > 1 ? "last " : ""}${whenText(pick.meeting, today)}`;
  return { id: pick.id, title, detail: `${RECORD_LABELS.meeting} · ${count}${label} · ${where}` };
}

/**
 * Where a note can be moved: the top level (id null), then every note it may go under in tree
 * order: never itself or a note inside it, never a meeting, decision or question (they have no
 * notes under them). A meeting, decision or question itself goes only to another hub.
 */
export function moveTargets(tree, id) {
  const note = tree.get(id);
  const inHubOnly = isRecordKind(note?.kind);
  const below = new Set(tree.inOrder(id).map((each) => each.id));
  const targets = tree.inOrder().filter((each) => each.id !== id && !below.has(each.id) && !isRecordKind(each.kind)
    && (!inHubOnly || isHub(tree, each.id)) && each.id !== tree.parentId(id));
  const items = targets.map((each) => ({ id: each.id, title: each.title, detail: whereText(tree, each.id) }));
  if (!inHubOnly && tree.parentId(id) !== null) items.unshift({ id: null, title: "Top level", detail: "the Inbox" });
  return items;
}

/** "Projects › Acme": a note's group and the notes above it. */
export function whereText(tree, id) {
  return [groupOf(tree, id).heading, ...tree.ancestors(id).reverse().map((each) => tree.get(each).title)].join(" › ");
}

// After a dialog, the focus goes back to the note (or the panel over it).
function focusNote(app) {
  return { fallbackFocus: () => app.focusNote() };
}
