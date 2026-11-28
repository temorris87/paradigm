// Status logs (health, staleness, since last log, the digest), the Plan strip and key sequences.
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Plan } from "../../static/js/plan/plan-model.js";
import { planStrip, portfolioBars, weekdaysBetween } from "../../static/js/plan/plan-rows.js";
import { Records } from "../../static/js/records/records-model.js";
import { logStatusDialog } from "../../static/js/status/status-commands.js";
import { StatusLogs, digest, digestHtml, firstSentence, healthOf, sinceLastLog } from "../../static/js/status/status-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { outcomeLine } from "../../static/js/hubs/dash-head.js";
import { PlanStrip } from "../../static/js/hubs/plan-strip.js";
import { keyReader } from "../../static/js/ui/key-sequence.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Platform", kind: "area", updated_at: T },
  { id: 2, parent_id: null, title: "Event bus", kind: "project", area_id: 1, status: "active", updated_at: T },
  { id: 3, parent_id: null, title: "Gateway", kind: "project", area_id: 1, status: "active", updated_at: T },
  { id: 4, parent_id: null, title: "Cache", kind: "project", area_id: 1, status: "on_hold", updated_at: T },
  { id: 5, parent_id: 2, title: "Design", kind: "phase", updated_at: T },
  { id: 6, parent_id: 2, title: "Cutover", kind: "phase", updated_at: T },
  { id: 7, parent_id: 2, title: "Use JetStream", kind: "decision", updated_at: T },
  { id: 8, parent_id: 2, title: "Exactly-once?", kind: "question", updated_at: T },
];
const tree = () => new NoteTree(NOTES);
const log = (id, noteId, day, health, text) => ({ id, note_id: noteId, day, health, text, created_at: T });
const LOGS = new StatusLogs([log(1, 2, "2026-11-13", "on_track", "Picked JetStream. Dual-write agreed."),
  log(2, 2, "2026-11-20", "at_risk", "Design slipped again (+9 d). ADR waits."), log(3, 3, "2026-11-01", "on_track", "Fine.")], 14);

test("status: the newest entry is the health; on hold wins; stale at 14 days", () => {
  const today = "2026-11-23";
  const bus = healthOf(LOGS, tree().get(2), today);
  assertEqual([bus.key, bus.label, bus.age, bus.stale].join(), "at_risk,At risk,3,false");
  const gateway = healthOf(LOGS, tree().get(3), today);
  assertEqual([gateway.key, gateway.stale, gateway.age].join(), "on_track,true,22");
  assertEqual(healthOf(LOGS, tree().get(4), today).key, "on_hold");
  const none = healthOf(new StatusLogs(), tree().get(3), today);
  assertEqual([none.key, none.label, none.never, none.stale].join(), "none,—,true,false");
  assertEqual(LOGS.of(2).map((entry) => entry.id).join(), "2,1", "newest first");
});

test("status: first sentence, outcome line", () => {
  assertEqual(firstSentence("Design slipped again (+9 d). ADR waits."), "Design slipped again (+9 d).");
  assertEqual(firstSentence("**No** full stop here"), "No full stop here");
  assertEqual(outcomeLine("\n# All events on NATS. Zero downtime.\nMore"), "All events on NATS.");
  assertEqual(outcomeLine(""), "");
});

test("status: since last log offers date moves, decisions, answers and done tasks after it", () => {
  const plan = new Plan({
    phases: [{ id: 5, start: "2026-11-09", end: "2026-12-04", baseline_start: "2026-11-09", baseline_end: "2026-11-27" }],
    changes: [{ id: 1, note_id: 5, field: "end", old: "2026-11-30", new: "2026-12-04", changed_at: "2026-11-21T10:00:00Z", reason: "load tests" },
      { id: 2, note_id: 5, field: "end", old: "2026-11-27", new: "2026-11-30", changed_at: "2026-11-10T10:00:00Z", reason: "" }],
  });
  const records = new Records([{ id: 7, kind: "decision", day: "2026-11-21", people: [] },
    { id: 8, kind: "question", day: "2026-11-02", people: [], answered: "2026-11-22" }]);
  const task = (id, done, day) => ({ id, note_id: 5, parent_id: null, title: `t${id}`, done, done_day: day, position: id, delegate_id: null });
  const tasks = new Tasks([task(1, true, "2026-11-21"), task(2, true, "2026-11-22"), task(3, true, "2026-11-12"), task(4, false, "")]);
  const lines = sinceLastLog({ tree: tree(), plan, records, tasks, statusLogs: LOGS }, tree().get(2), "2026-11-23").map((line) => line.text);
  assertEqual(lines.join(" | "), "Design moved +4 d: load tests | Decided: Use JetStream | Answered: Exactly-once? | 2 tasks done");
});

test("status: the weekly digest, as Markdown and as HTML", () => {
  const records = new Records([{ id: 7, kind: "decision", day: "2026-11-24", people: [] }, { id: 8, kind: "question", day: "2026-11-02", people: [] }]);
  const text = digest({ tree: tree(), plan: new Plan(), records, tasks: new Tasks(), statusLogs: LOGS }, tree().get(1), "2026-11-25");
  assertEqual(text, ["## Platform — w/e Fri 27 Nov",
    "- **Cache** — on hold.",
    "- **Event bus** — at risk. Design slipped again (+9 d).",
    "- **Gateway** — on track. Fine.",
    "Decisions: Use JetStream",
    "Open: Exactly-once?"].join("\n"));
  assertEqual(digestHtml("## A & B\n- **X** — fine.\nOpen: Y"), "<h2>A &amp; B</h2><ul><li><strong>X</strong> — fine.</li></ul><p>Open: Y</p>");
});

test("plan strip: phases as wide as their working days, the current one late, today inside it", () => {
  const plan = new Plan({ phases: [
    { id: 5, start: "2026-11-02", end: "2026-11-13", baseline_start: "2026-11-02", baseline_end: "2026-11-06" },
    { id: 6, start: "2026-11-16", end: "2026-11-20", baseline_start: "2026-11-16", baseline_end: "2026-11-20" }] });
  assertEqual(weekdaysBetween("2026-11-02", "2026-11-13"), 10);
  const strip = planStrip(tree(), plan, 2, "2026-11-09");
  assertEqual(strip.segments.map((each) => `${each.label}:${each.state}:${each.days}`).join(), "Design · +7 d:current:10,Cutover:future:5");
  assertTrue(strip.segments[0].late);
  assertTrue(strip.todayAt > 0.3 && strip.todayAt < 0.4, String(strip.todayAt));
  assertEqual(planStrip(tree(), plan, 2, "2026-11-25").segments.map((each) => each.state).join(), "done,done");
  assertEqual(planStrip(tree(), new Plan(), 2, "2026-11-25"), null);
  const bars = portfolioBars(tree(), plan, 1, "2026-11-09");
  assertEqual(bars.map((bar) => `${bar.label}${bar.muted ? " (muted)" : ""}`).join(), "Cache (muted),Event bus,Gateway");
  assertTrue(bars[1].width > 0 && bars[2].width === 0, "a project with no plan has no bar");
});

test("plan strip: a project with no phases offers + Phase and Apply plan template…; an area has none", () => {
  const root = document.createElement("section");
  const ran = [];
  const strip = new PlanStrip(root, { onOpen: () => ran.push("open"), onPlan: () => ran.push("plan"),
    onAddPhase: () => ran.push("phase"), onApplyTemplate: () => ran.push("template") });
  const ctx = { tree: tree(), plan: new Plan(), today: new Date(2026, 10, 25) };
  strip.show(ctx, ctx.tree.get(3));
  assertTrue(!root.hidden, "a project always has its strip");
  assertEqual(root.querySelector(".plan-strip__empty").textContent, "No phases yet");
  for (const button of root.querySelectorAll("button")) button.click();
  assertEqual(ran.join(), "plan,phase,template", "Gantt in the card's head, over the strip");
  strip.show(ctx, { ...ctx.tree.get(3), archived_at: T });
  assertEqual(root.querySelectorAll(".plan-strip__add").length, 0, "nothing is added to an archived project");
  strip.show(ctx, ctx.tree.get(1));
  assertTrue(root.hidden, "an area's plan is its Portfolio");
});

test("key sequences: gg waits for its second key; a stray second key means nothing", () => {
  let clock = 0;
  const read = keyReader([{ keys: ["gg", "Home"], action: "first" }, { keys: ["gp"], action: "plan" }, { keys: ["j"], action: "next" }],
    { now: () => clock });
  const key = (k) => read({ key: k, ctrlKey: false, altKey: false, metaKey: false });
  assertEqual(key("g"), "pending");
  assertEqual(key("g"), "first");
  assertEqual([key("g"), key("p")].join(), "pending,plan");
  assertEqual([key("g"), key("x"), key("j")].join(), "pending,,next");
  assertEqual(key("Home"), "first");
  key("g");
  clock = 5000;
  assertEqual(key("j"), "next", "a late second key stands on its own");
});

test("plan: a move's knock-on effect, and a slip in words", async () => {
  const { moveImpact, slipWords } = await import("../../static/js/plan/plan-model.js");
  const plan = new Plan({ phases: [
    { id: 5, start: "2026-11-09", end: "2026-11-27", baseline_start: "2026-11-09", baseline_end: "2026-11-20" },
    { id: 6, start: "2026-11-30", end: "2026-12-04", baseline_start: "2026-11-30", baseline_end: "2026-12-04" }],
  changes: [1, 2, 3].map((n) => ({ id: n, note_id: 5, field: "end", old: "2026-11-1" + n, new: "2026-11-2" + n, changed_at: `2026-11-0${n}T10:00:00Z` })) });
  assertEqual(moveImpact(tree(), plan, 5, { start: "2026-11-09", end: "2026-12-01" }, "2026-12-08"),
    "+4 d · 4th move later · pushes Cutover; 4 d slack left before due");
  assertEqual(moveImpact(tree(), plan, 5, { start: "2026-11-09", end: "2026-11-27" }), "", "nothing moved");
  assertEqual(slipWords({ days: 9, moves: 3 }), "9 days later than planned, moved 3 times");
  assertEqual(slipWords({ days: 0, moves: 0 }), "");
});

test("log status: opened from a menu that is gone, Escape gives the focus back to the page", async () => {
  // The crumb's ▾ menu item that opened it is removed by the time the dialog closes.
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  let focused = 0;
  const app = { tree: tree(), plan: new Plan([]), records: new Records([]), tasks: new Tasks([]), statusLogs: LOGS,
    today: () => new Date("2026-11-23T12:00:00"), focusNote: () => { focused += 1; } };
  const result = logStatusDialog(app, tree().get(2));
  opener.remove();
  const dialog = document.querySelector("dialog.dialog");
  dialog.querySelector("textarea").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assertEqual(await result, null);
  assertEqual(focused, 1, "the page has the focus again, so L works without a click");
});
