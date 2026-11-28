// Phases, milestones and their slips; the Gantt chart's maths; plan templates' rows; note
// templates; OneDrive files; the roll-up of questions and decisions.
import { barBox, chartAxis, dayAt, dragged, fitDayPx } from "../../static/js/gantt/gantt-model.js";
import { ganttAction } from "../../static/js/gantt/gantt-keys.js";
import { Files, fileDir, filesOn, folderSummary, foldersFor, foldersOf, unlinkText } from "../../static/js/files/files-model.js";
import { HUB_SECTIONS, sectionsFor } from "../../static/js/hubs/hub-sections.js";
import { noteMenuItems } from "../../static/js/notes/note-menu.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Plan, addDays, changeText, dayNumber, dayString, milestonesOf, nextMilestone, phasesOf, projectSpan,
  shortDay, slipOf, slipText } from "../../static/js/plan/plan-model.js";
import { areaRows, projectRows, templateRows } from "../../static/js/plan/plan-rows.js";
import { Records, recordsOn } from "../../static/js/records/records-model.js";
import { fillTemplate } from "../../static/js/templates/template-text.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";
// Loaded so a slip in them fails here: they need a page to run, not to load.
import "../../static/js/hubs/hub-actions.js";
import "../../static/js/hubs/dashboard.js";
import "../../static/js/plan/template-page.js";
import { searchFilesDialog, unlinkFolderDialog } from "../../static/js/files/file-commands.js";
import "../../static/js/templates/template-commands.js";
import "../../static/js/notes/app.js";
import "../../static/js/calendar/calendar-page.js";
import "../../static/js/timesheet/time-page.js";

const assertEqual = (actual, expected) => same(JSON.stringify(actual), JSON.stringify(expected));

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Grid ops", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Pilot", kind: "project", area_id: 1, status: "active", updated_at: T },
  { id: 3, parent_id: 2, title: "Design", kind: "phase", updated_at: T },
  { id: 4, parent_id: 2, title: "Build", kind: "phase", updated_at: T },
  { id: 5, parent_id: 3, title: "Sign-off", kind: "milestone", updated_at: T },
  { id: 6, parent_id: 2, title: "Go-live", kind: "milestone", updated_at: T },
  { id: 7, parent_id: 3, title: "Sketches", updated_at: T },
  { id: 8, parent_id: 2, title: "Spec", updated_at: T },
  { id: 9, parent_id: 1, title: "Q?", kind: "question", updated_at: T },
  { id: 10, parent_id: 2, title: "Who signs?", kind: "question", updated_at: T },
  { id: 11, parent_id: null, title: "Site visit", kind: "template", updated_at: T },
];
const PLAN = {
  phases: [
    { id: 3, start: "2026-11-02", end: "2026-11-20", baseline_start: "2026-11-02", baseline_end: "2026-11-13" },
    { id: 4, start: "2026-11-23", end: "2026-12-18", baseline_start: "2026-11-23", baseline_end: "2026-12-18" },
  ],
  milestones: [
    { id: 5, day: "2026-11-20", baseline_day: "2026-11-13", done_day: "2026-11-20" },
    { id: 6, day: "2026-12-18", baseline_day: "2026-12-18", done_day: "" },
  ],
  changes: [
    { id: 1, note_id: 3, field: "end", old: "2026-11-13", new: "2026-11-16", changed_at: "2026-11-09T10:00:00Z", reason: "late" },
    { id: 2, note_id: 3, field: "end", old: "2026-11-16", new: "2026-11-18", changed_at: "2026-11-12T10:00:00Z", reason: "" },
    { id: 3, note_id: 3, field: "end", old: "2026-11-18", new: "2026-11-20", changed_at: "2026-11-16T10:00:00Z", reason: "vendor" },
    // The same move as id 3: a bar dragged moves both ends at once.
    { id: 4, note_id: 3, field: "start", old: "2026-10-30", new: "2026-11-02", changed_at: "2026-11-16T10:00:00Z", reason: "vendor" },
  ],
  applied: [{ project_id: 2, template_id: 1, title: "Standard", applied_at: T }],
};
const tree = () => new NoteTree(NOTES);
const plan = () => new Plan(PLAN);

test("plan: days, phases, milestones", () => {
  assertEqual([dayString(dayNumber("2026-11-30")), addDays("2026-11-30", 2), shortDay("2026-12-03", "2026-11-01"), shortDay("2027-01-04", "2026-11-01")],
    ["2026-11-30", "2026-12-02", "3 Dec", "4 Jan 2027"]);
  assertEqual(phasesOf(tree(), plan(), 2).map(({ note }) => note.title), ["Design", "Build"]);
  assertEqual(milestonesOf(tree(), plan(), 2).map(({ note, phase }) => [note.title, phase?.title ?? null]), [["Sign-off", "Design"], ["Go-live", null]]);
  assertEqual(milestonesOf(tree(), plan(), 3).map(({ note }) => note.title), ["Sign-off"]);
  assertEqual(nextMilestone(tree(), plan(), 2).note.title, "Go-live");
  assertEqual(projectSpan(tree(), plan(), 2), { start: "2026-11-02", end: "2026-12-18" });
  assertEqual(plan().appliedTo(2).title, "Standard");
});

test("plan: a slip against the baseline, and one that keeps slipping", () => {
  const slip = slipOf(plan(), 3);
  assertEqual(slip, { days: 7, moves: 3, later: 3, keepsSlipping: true });
  assertEqual(slipText(slip), "+7 d, moved 3×");
  assertEqual(slipText(slipOf(plan(), 4)), "");
  assertEqual(slipOf(plan(), 5).days, 7);
  assertEqual(changeText(PLAN.changes[0], "2026-11-01"), "9 Nov: end 13 Nov → 16 Nov — late");
});

test("gantt: the axis, bars, drags", () => {
  const rows = projectRows(tree(), plan(), 2, "2026-11-24");
  assertEqual(rows.map((row) => [row.key, row.marks.length]), [["phase:3", 1], ["phase:4", 0], ["milestones:2", 1]]);
  assertTrue(rows[0].late && rows[0].badge.includes("keeps slipping"), rows[0].badge);
  const axis = chartAxis(rows, { today: "2026-11-24" });
  assertEqual(dayString(axis.first), "2026-11-02");                  // a Monday
  assertEqual(new Date(axis.last * 86400000).getUTCDay(), 0);      // a Sunday
  assertEqual(axis.ticks[0].label, "2 Nov");
  assertEqual(barBox(axis, rows[0], 10), { left: 0, width: 190 });
  assertEqual(dayString(dayAt(axis, 25, 10)), "2026-11-04");
  assertEqual(dragged({ start: 10, end: 20 }, "body", 3), { start: 13, end: 23 });
  assertEqual(dragged({ start: 10, end: 20 }, "end", -15), { start: 10, end: 10 });
  assertEqual(dragged({ start: 10, end: 20 }, "start", 15), { start: 20, end: 20 });
  assertEqual(fitDayPx({ days: 1000 }, 900), 4);
  const offsets = chartAxis([{ start: 0, end: 12, marks: [] }], { mode: "offsets" });
  assertEqual([offsets.first, offsets.ticks[1].label], [0, "Day 5"]);
  const key = (k) => ganttAction({ key: k, ctrlKey: false, altKey: false, metaKey: false });
  assertEqual([key("j"), key("e"), key(" "), key("p"), key("q")], ["next", "edit", "done", "newPhase", null]);
  assertEqual([key("t"), key("h")], ["history", null], "t is the date history (timeline); h no longer");
});

test("gantt: an area's bar per project, a template's rows", () => {
  const rows = areaRows(tree(), plan(), 1, "2026-11-24");
  assertEqual(rows.map((row) => [row.label, dayString(row.start), dayString(row.end), row.marks.length]), [["Pilot", "2026-11-02", "2026-12-18", 2]]);
  const template = { id: 1, items: [
    { id: 1, kind: "phase", title: "Design", start: 0, end: 4, phase_id: null, tasks: [{ id: 1, parent_id: null, title: "Load study" }] },
    { id: 2, kind: "milestone", title: "Sign-off", start: 4, end: 4, phase_id: 1, tasks: [] },
    { id: 3, kind: "milestone", title: "Go-live", start: 20, end: 20, phase_id: null, tasks: [] },
  ] };
  assertEqual(templateRows(template).map((row) => [row.label, row.marks.map((mark) => mark.label)]), [["Design", ["Sign-off"]], ["Milestones", ["Go-live"]]]);
});

test("sections: a project's plan, a phase's milestones and tasks; roll-up to the project only", () => {
  assertEqual(sectionsFor(tree().get(2)).map((section) => section.key), ["plan", "tasks", "questions", "decisions", "meetings", "files", "notes", "people"]);
  assertEqual(sectionsFor(tree().get(3)).map((section) => section.key), ["tasks", "milestones", "files", "notes"]);
  assertEqual(sectionsFor(tree().get(8)).map((section) => section.key), ["tasks", "files"]);
  const ctx = { tree: tree(), plan: plan(), today: new Date(2026, 10, 24) };
  const planRows = HUB_SECTIONS.find((section) => section.key === "plan").rows(ctx, tree().get(2));
  assertEqual(planRows.map((row) => row.title), ["Design", "Build", "◆ Sign-off", "◆ Go-live"]);
  assertTrue(planRows[0].detail.includes("+7 d, moved 3×"), planRows[0].detail);
  // A project's Notes leave its phases (and what is in them) to the Plan.
  const notes = HUB_SECTIONS.find((section) => section.key === "notes").rows(ctx, tree().get(2));
  assertEqual(notes.map((row) => row.title), ["Spec"]);
  const records = new Records([{ id: 9, kind: "question", day: "2026-11-20", answered: "" }, { id: 10, kind: "question", day: "2026-11-21", answered: "" }]);
  assertEqual(recordsOn(tree(), records, tree().get(1), "question").map((entry) => entry.note.title), ["Q?"]);
  assertEqual(recordsOn(tree(), records, tree().get(2), "question").map((entry) => entry.note.title), ["Who signs?"]);
  const projects = HUB_SECTIONS.find((section) => section.key === "projects").rows({ ...ctx, records, meetings: { all: () => [], get: () => ({}) } }, tree().get(1));
  assertTrue(projects[0].detail.includes("1 open question") && projects[0].detail.includes("◆ Go-live"), projects[0].detail);
});

test("note menu: insert a template, make a phase", () => {
  const keys = (id, window = "note") => noteMenuItems(tree(), id, { window }).map((item) => item.key).filter(Boolean);
  assertTrue(keys(8).includes("makePhase") && keys(8).includes("insertTemplate") && keys(8).includes("dashboard"));
  assertTrue(keys(3).includes("unmakePhase") && !keys(3).includes("file"));
  assertTrue(!keys(8, "main").includes("insertTemplate"));
  assertEqual(keys(11), ["rename", "insertTable", "insertDiagram", "export", "trash"]);
});

test("templates: placeholders, the cursor, boxes become tasks", () => {
  const body = "# {{title}} {{date}}\n\nAt {{time}}\n{{cursor}}\n- [ ] Photos\n  - [ ] Wide shots\n    - [x] Deeper\n- [ ] Report\n\nEnd\n";
  const filled = fillTemplate(body, { date: "2026-11-24", time: "09:30", title: "Substation" });
  assertEqual(filled.text, "# Substation 2026-11-24\n\nAt 09:30\n\n\nEnd");
  assertEqual(filled.cursorAt, 3);
  assertEqual(filled.tasks, [{ title: "Photos", done: false, parent: null }, { title: "Wide shots", done: false, parent: 0 },
    { title: "Deeper", done: true, parent: 0 }, { title: "Report", done: false, parent: null }]);
});

test("files: one file on many notes, a project's with its phases', folders of the hub and its area", () => {
  const files = new Files({
    folders: [{ id: 1, note_id: 2, path: "/od/Pilot", name: "Pilot" }, { id: 2, note_id: 1, path: "/od/Ops", name: "Ops" }],
    files: [{ id: 1, folder_id: 1, rel_path: "Design/Load study.xlsx", name: "Load study.xlsx", missing: false },
      { id: 2, folder_id: 1, rel_path: "Quote.pdf", name: "Quote.pdf", missing: true }],
    links: [{ file_id: 1, note_id: 3 }, { file_id: 1, note_id: 9 }, { file_id: 2, note_id: 2 }],
  });
  const on = filesOn(tree(), files, tree().get(2));
  assertEqual(on.map((entry) => [entry.file.name, entry.own, entry.via?.title ?? null]), [["Load study.xlsx", false, "Design"], ["Quote.pdf", true, null]]);
  assertEqual(filesOn(tree(), files, tree().get(1)).map((entry) => entry.file.name), ["Load study.xlsx"]);
  assertEqual(foldersFor(tree(), files, 7).map((folder) => folder.name), ["Pilot", "Ops"]);
  assertEqual([fileDir(files.file(1)), fileDir(files.file(2))], ["Design", ""]);
  const rows = HUB_SECTIONS.find((section) => section.key === "files").rows({ tree: tree(), files }, tree().get(2));
  assertTrue(rows[2].late && rows[2].detail.includes("not in the folder"), rows[2].detail);
});

test("files: a hub's linked folders come first in its Files, with what they hold; only on the hub", () => {
  const files = new Files({
    folders: [{ id: 1, note_id: 2, path: "/od/Pilot", name: "Pilot" }, { id: 2, note_id: 2, path: "/od/Contracts", name: "Contracts" },
      { id: 3, note_id: 1, path: "/od/Ops", name: "Ops" }],
    files: [{ id: 1, folder_id: 1, rel_path: "a.xlsx", name: "a.xlsx", missing: false },
      { id: 2, folder_id: 1, rel_path: "b.pdf", name: "b.pdf", missing: false },
      { id: 3, folder_id: 1, rel_path: "c.pdf", name: "c.pdf", missing: false },
      { id: 4, folder_id: 3, rel_path: "d.pdf", name: "d.pdf", missing: false }],
    links: [{ file_id: 1, note_id: 3 }, { file_id: 1, note_id: 8 }, { file_id: 2, note_id: 8 }],
  });
  assertEqual(foldersOf(files, 2).map((folder) => folder.name), ["Contracts", "Pilot"]);
  assertEqual(folderSummary(files, 1), { files: 3, attached: 2, noteIds: [3, 8], trashed: 0 });
  assertEqual(folderSummary(files, 2), { files: 0, attached: 0, noteIds: [], trashed: 0 });
  const binned = new Files({ folders: [{ id: 5, note_id: 2, path: "/od/C", name: "C", trashed: 1 }],
    files: [{ id: 9, folder_id: 5, rel_path: "Lease.pdf", name: "Lease.pdf", missing: false }], links: [] });
  assertEqual(folderSummary(binned, 5), { files: 1, attached: 0, noteIds: [], trashed: 1 });
  const section = HUB_SECTIONS.find((each) => each.key === "files");
  const rows = section.rows({ tree: tree(), files }, tree().get(2));
  assertEqual(rows.map((row) => [row.title, row.folder ?? null]),
    [["📁 Contracts", 2], ["📁 Pilot", 1], ["a.xlsx", null], ["b.pdf", null]]);
  assertEqual(rows[1].detail, "OneDrive folder · 3 files · 2 on notes");
  assertEqual(rows[0].detail, "OneDrive folder · 0 files");
  assertEqual([rows[1].tip, rows[1].actions], ["/od/Pilot", [{ key: "remove", label: "Unlink" }]]);
  assertEqual(section.detail(rows), "2");
  assertEqual(section.rows({ tree: tree(), files }, tree().get(3)).some((row) => row.folder !== undefined), false);
  assertEqual(section.rows({ tree: tree(), files }, tree().get(1)).map((row) => row.title), ["📁 Ops"]);
});

test("files: the unlink confirm names the notes its files come off", () => {
  const titles = { 3: "Kickoff", 4: "Phase 1", 5: "Review", 6: "Wrap-up" };
  const titleOf = (id) => titles[id] ?? null;
  assertEqual(unlinkText("Contracts", "Northwind rollout", { files: 4, attached: 0, noteIds: [] }, titleOf),
    'Unlink "Contracts" from "Northwind rollout"? Nothing in OneDrive changes.');
  assertEqual(unlinkText("Contracts", "Northwind rollout", { files: 4, attached: 3, noteIds: [3, 4] }, titleOf),
    'Unlink "Contracts" from "Northwind rollout"? Its 3 files on notes come off them (Kickoff, Phase 1). Nothing in OneDrive changes.');
  assertEqual(unlinkText("C", "N", { files: 1, attached: 1, noteIds: [3] }, titleOf),
    'Unlink "C" from "N"? Its 1 file on notes comes off it (Kickoff). Nothing in OneDrive changes.');
  assertEqual(unlinkText("C", "N", { files: 9, attached: 5, noteIds: [3, 4, 5, 6, 99] }, titleOf),
    'Unlink "C" from "N"? Its 5 files on notes come off them (Kickoff, Phase 1, Review, …). Nothing in OneDrive changes.');
  assertEqual(unlinkText("C", "N", { files: 1, attached: 0, noteIds: [], trashed: 1 }, titleOf),
    'Unlink "C" from "N"? 1 attachment on notes in the trash goes too, for good. Nothing in OneDrive changes.');
  assertEqual(unlinkText("C", "N", { files: 2, attached: 1, noteIds: [3], trashed: 2 }, titleOf),
    'Unlink "C" from "N"? Its 1 file on notes comes off it (Kickoff). 2 attachments on notes in the trash go too, for good. Nothing in OneDrive changes.');
});

test("gantt: the axis thins its ticks so labels never collide", async () => {
  const { chartAxis, ticksFor, TICK_PX } = await import("../../static/js/gantt/gantt-model.js");
  const at = dayNumber("2026-09-07");
  const axis = chartAxis([{ key: "a", start: at, end: at + 180, marks: [] }], { today: null });
  assertEqual(ticksFor(axis, 10).length, axis.ticks.length, "70 px a week: every week");
  for (const dayPx of [5, 3.6, 2, 1]) {
    const ticks = ticksFor(axis, dayPx);
    assertTrue(ticks.every((tick, i) => i === 0 || (tick.at - ticks[i - 1].at) * dayPx >= TICK_PX), `${dayPx} px a day: no two labels closer than one`);
    assertTrue(ticks.length >= Math.floor((axis.days * dayPx) / (TICK_PX * 2)), `${dayPx} px a day: still labelled`);
  }
});

test("files: a folder row left over after an unlink elsewhere says the folder is no longer linked", async () => {
  // The page still holds folder 1; the reload the dialog does first finds it gone.
  const app = {
    tree: tree(),
    files: new Files({ folders: [{ id: 1, note_id: 2, path: "/od/C", name: "C" }] }),
    refreshTree: async () => { app.files = new Files(); },
  };
  const rejects = async (promise) => {
    try { await promise; } catch (error) { return error.message; }
    return "no error";
  };
  assertEqual(await rejects(unlinkFolderDialog(app, 1)), "E: that folder is no longer linked");
  app.files = new Files({ folders: [{ id: 1, note_id: 2, path: "/od/C", name: "C" }] });
  assertEqual(await rejects(searchFilesDialog(app, app.tree.get(2), { folderId: 1 })), "E: that folder is no longer linked");
});
