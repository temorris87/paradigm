// The next action: one flagged open task per page, else the first open one of mine.
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Tasks, nextAction } from "../../static/js/tasks/tasks-model.js";
import { assertEqual, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const tree = () => new NoteTree([
  { id: 1, parent_id: null, title: "Move", kind: "project", updated_at: T },
  { id: 2, parent_id: 1, title: "Design", kind: "phase", updated_at: T },
  { id: 3, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
]);
const task = (id, noteId, more = {}) => ({ id, note_id: noteId, parent_id: null, title: `t${id}`, notes: "", due: "",
  delegate_id: null, follow_up: "", done: false, done_day: "", position: id, is_next: false, ...more });

test("next action: with none flagged, the first open task of mine stands in", () => {
  const tasks = new Tasks([task(10, 1, { done: true }), task(11, 1, { delegate_id: 3 }), task(12, 1), task(13, 2)]);
  assertEqual(nextAction(tree(), tasks, tree().get(1)).task.id, 12);
  assertEqual(nextAction(tree(), tasks, tree().get(2)).task.id, 13);
  assertEqual(nextAction(tree(), new Tasks([task(10, 1, { done: true })]), tree().get(1)), null);
});

test("next action: the owner's own flag beats one flagged inside it", () => {
  const inside = new Tasks([task(12, 1), task(13, 2, { is_next: true })]);
  assertEqual(nextAction(tree(), inside, tree().get(1)).task.id, 13, "a phase's flag counts on its project");
  const both = new Tasks([task(12, 1, { is_next: true }), task(13, 2, { is_next: true })]);
  assertEqual(nextAction(tree(), both, tree().get(1)).task.id, 12);
  assertEqual(nextAction(tree(), both, tree().get(2)).task.id, 13, "the phase keeps its own");
});

test("next action: the Tasks section marks it NEXT and offers Make next on the others", () => {
  const section = HUB_SECTIONS.find((each) => each.key === "tasks");
  const ctx = { tree: tree(), tasks: new Tasks([task(12, 1), task(14, 1, { is_next: true })]), sessions: [],
    today: new Date(2026, 10, 24), expanded: new Set() };
  const rows = section.rows(ctx, tree().get(1));
  assertEqual(rows.map((row) => [row.task, row.next]).join(" "), "14,true 12,false", "the next action leads");
  assertEqual(rows[0].actions.some((action) => action.key === "next"), false);
  assertEqual(rows[1].actions.some((action) => action.key === "next"), true);
});
