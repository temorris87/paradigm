// Follow-ups on Today (docs/features/033-follow-up-log.md): only today's and carried ones, at the
// top; logged with Followed up… (tasks/follow-up-dialog.js), c and r; the task's History lines.
import { viewHints } from "../../static/js/layout/view-keys.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { closeFollowUp, followUpDialog } from "../../static/js/tasks/follow-up-dialog.js";
import { carriedReason, defaultNextDay, followUpLine, loggedText, ordinal, parseNextDay } from "../../static/js/tasks/follow-up-model.js";
import { historyRows } from "../../static/js/tasks/task-page-model.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { TODAY_KEYS } from "../../static/js/today/today-keys.js";
import { navCounts, upNext } from "../../static/js/today/today-model.js";
import { TodayPage } from "../../static/js/today/today-page.js";
import { toneOf } from "../../static/js/ui/chip-tones.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
// Friday 27 November 2026, 10:00.
const NOW = new Date(2026, 10, 27, 10, 0);
const NOTES = [
  { id: 1, parent_id: null, title: "Event bus", kind: "project", status: "active", updated_at: T },
  { id: 4, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
];
const task = (id, title, more = {}) => ({ id, note_id: 1, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, snoozed_until: "", follow_up_count: 0, ...more });
const TASKS = [
  task(10, "Draft ADR", { due: "2026-11-20" }),
  task(11, "Load-test numbers", { delegate_id: 4, follow_up: "2026-11-25", follow_up_count: 2 }),
  task(12, "Send the export", { delegate_id: 4, follow_up: "2026-11-27" }),
  task(13, "Next week's", { delegate_id: 4, follow_up: "2026-12-02" }),
  task(14, "Old one", { delegate_id: 4, follow_up: "2026-11-16" }),
];
const SETTINGS = { settings: { day_start: "08:00", day_end: "17:00", lunch_start: "12:00", lunch_end: "13:00" }, upcoming: [] };
const ctx = (tasks = TASKS) => ({ tree: new NoteTree(NOTES), tasks: new Tasks(tasks), sessions: [], timeSettings: SETTINGS });
const key = (target, k) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("follow-ups: model words: ordinals, the line, the default day, the carried chip, the status line", () => {
  assertEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal).join(), "1st,2nd,3rd,4th,11th,12th,13th,21st,22nd,23rd,101st,111th");
  assertEqual(followUpLine({ title: "Send it" }, { title: "Acme" }, 2), "Send it · Acme · 3rd follow-up");
  assertEqual(followUpLine({ title: "Send it" }, null, 0), "Send it · 1st follow-up");
  assertEqual(defaultNextDay("2026-11-27"), "2026-12-01", "Friday: two working days on is Tuesday");
  assertEqual(defaultNextDay("2026-11-24", { holidays: ["2026-11-26"] }), "2026-11-27", "a holiday doesn't count");
  assertEqual(JSON.stringify(carriedReason("2026-11-27", "2026-11-27")), '{"reason":"Today","reasonKind":"followup"}');
  assertEqual(carriedReason("2026-11-25", "2026-11-27").reason, "from Wed");
  assertEqual(carriedReason("2026-11-16", "2026-11-27").reason, "from 16 Nov", "past a week: the date");
  assertEqual(toneOf("carried"), "warning");
  assertEqual(toneOf("followup"), "info");
  assertEqual(loggedText("again", "2026-12-01", "Send it", "2026-11-27"), "Logged: follow up again Tue 1 Dec");
  assertEqual(loggedText("closed", "", "Send it", "2026-11-27"), "Logged and closed: Send it");
});

test("follow-ups: the date box reads days, words and offsets; today, earlier and nonsense are refused", () => {
  const today = "2026-11-27"; // a Friday
  assertEqual(parseNextDay("2026-12-01", today), "2026-12-01");
  assertEqual(parseNextDay("tomorrow", today), "2026-11-28");
  assertEqual(parseNextDay("+3", today), "2026-11-30");
  assertEqual(parseNextDay("mon", today), "2026-11-30");
  assertEqual(parseNextDay("fri", today), "2026-12-04", "a weekday is the next one after today");
  const refused = (word) => {
    try {
      parseNextDay(word, today);
      return "";
    } catch (error) {
      return error.message;
    }
  };
  assertEqual(refused("today"), "Follow up again after today");
  assertEqual(refused("2026-11-20"), "Follow up again after today");
  assertTrue(refused("soonish").includes("is not a day"), refused("soonish"));
  assertTrue(refused("2026-02-30").includes("is not a day"), "not a real date");
  assertEqual(refused(""), "Pick the day to follow up again");
});

test("follow-ups: Up next starts with today's and carried ones, oldest first; later ones stay off Today", () => {
  const items = upNext(ctx(), NOW);
  const follow = items.filter((item) => item.group === "followup");
  assertEqual(follow.map((item) => `${item.reason}:${item.title}`).join(" | "),
    "from 16 Nov:Old one | from Wed:Load-test numbers | Today:Send the export");
  assertEqual(follow.map((item) => item.reasonKind).join(), "carried,carried,followup");
  assertTrue(!items.some((item) => item.title === "Next week's"), "a follow-up due later never shows on Today");
  assertEqual(items.slice(follow.length).map((item) => item.title).join(), "Draft ADR");
  assertEqual(navCounts(ctx(), NOW).overdue, 1, "follow-ups don't count as overdue");
});

test("follow-ups: the page labels the two groups; none due, no labels", () => {
  const section = document.createElement("section");
  document.body.append(section);
  try {
    const page = new TodayPage(section, { onOpen: () => {}, onLeave: () => {}, today: () => NOW });
    page.show(ctx());
    const labels = () => [...section.querySelectorAll(".today-next__group")].map((node) => node.textContent).join(" | ");
    assertEqual(labels(), "Follow up today · 3 | Then · ranked");
    const chips = [...section.querySelectorAll(".today-next__row .chip")].map((node) => node.textContent);
    assertEqual(chips.slice(0, 3).join(), "FROM 16 NOV,FROM WED,TODAY");
    page.show(ctx(TASKS.filter((each) => each.delegate_id === null)));
    assertEqual(labels(), "", "no follow-up due: Up next as before");
  } finally {
    section.remove();
  }
});

test("follow-ups: Space, c and r on a follow-up row; Space elsewhere still ticks; the bar follows the cursor", () => {
  const section = document.createElement("section");
  document.body.append(section);
  try {
    const calls = [];
    let moved = 0;
    const page = new TodayPage(section, { onOpen: () => {}, onLeave: () => {}, today: () => NOW, onCursor: () => { moved += 1; },
      actions: { done: (id, done) => calls.push(`done ${id} ${done}`), followedUp: (id) => calls.push(`followed ${id}`),
        closeFollowUp: (id) => calls.push(`close ${id}`), followUpAgain: (id) => calls.push(`again ${id}`) } });
    page.show(ctx());
    assertEqual(page.activeItem().kind, "followup");
    key(page.list, " ");
    key(page.list, "c");
    key(page.list, "r");
    for (let i = 0; i < 3; i += 1) key(page.list, "j");
    assertEqual(page.activeItem().title, "Draft ADR");
    key(page.list, "c");
    key(page.list, "r");
    key(page.list, " ");
    assertEqual(calls.join("|"), "followed 14|close 14|again 14|done 10 true", "c and r do nothing off a follow-up");
    assertTrue(moved >= 4, "the cursor's moves are reported");
    page.moveTo(0);
    section.querySelector(".today-next__glyph--action").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assertEqual(calls.pop(), "followed 14", "a click on → logs it");
  } finally {
    section.remove();
  }
  const bar = (followUp) => viewHints("home", "plan", { followUp }).map(({ cap, words }) => `${cap} ${words}`).join(", ");
  assertEqual(bar(true), "j k move, Space followed up…, c close it, r follow up again on…, o open, f follow, ? all keys");
  assertTrue(bar(false).includes("Space done"), bar(false));
  assertTrue(TODAY_KEYS.every((entry) => entry.help));
});

test("follow-ups: the task's History lines: next day, or closed", () => {
  const rows = historyRows([
    { key: "followup:2", day: "2026-11-27", kind: "followed_up", text: "Followed up", next: null, closed: true },
    { key: "followup:1", day: "2026-11-25", kind: "followed_up", text: "Followed up: Pinged on Teams", next: "2026-12-01", closed: false },
  ], NOW);
  assertEqual(rows.map((row) => row.text).join(" | "), "Followed up · closed | Followed up: Pinged on Teams · next Tue 1 Dec");
});

function fakeApp(posted, { fail = null } = {}) {
  const said = [];
  return {
    said,
    tree: new NoteTree(NOTES),
    tasks: new Tasks(TASKS),
    timeSettings: SETTINGS,
    today: () => NOW,
    changes: { send: () => {} },
    refreshTree: async () => {},
    say: (text) => said.push(text),
    tasksApi: {
      followedUp: async (id, body) => {
        if (fail) throw new Error(fail);
        posted.push({ id, ...body });
        return { id, follow_up_count: 3 };
      },
    },
  };
}

test("follow-ups: Followed up…: the line, Follow up again on two working days on; j k switch; Enter logs", async () => {
  const posted = [];
  const app = fakeApp(posted);
  const done = followUpDialog(app, 11);
  const dialog = document.querySelector(".follow-up-dialog");
  try {
    assertEqual(dialog.querySelector(".dialog__title").textContent, "Followed up with Priya Shah");
    assertEqual(dialog.querySelector(".follow-up-dialog__line").textContent, "Load-test numbers · Event bus · 3rd follow-up");
    const date = dialog.querySelector(".follow-up-dialog__date-input");
    assertEqual(date.value, "2026-12-01");
    assertEqual(dialog.querySelector(".follow-up-dialog__reads").textContent, "Tue 1 Dec");
    const checked = () => dialog.querySelector('[role="radio"][aria-checked="true"]').dataset.value;
    assertEqual(checked(), "again", "Follow up again is the default");
    const again = dialog.querySelector('[data-value="again"]');
    again.focus();
    key(again, "j");
    assertEqual(checked(), "closed");
    assertTrue(date.disabled, "the date box is off with Close it");
    key(document.activeElement, "k");
    assertEqual(checked(), "again");
    // Refused inside: the dialog stays.
    date.value = "2026-11-27";
    dialog.querySelector("form").requestSubmit();
    await tick();
    assertEqual(dialog.querySelector(".dialog__error").textContent, "Follow up again after today");
    assertTrue(dialog.isConnected && !posted.length);
    dialog.querySelector(".follow-up-dialog__pick").click();
    assertEqual(date.value, "2026-11-28", "+1 tomorrow");
    dialog.querySelector(".dialog__input").value = "Pinged on Teams";
    dialog.querySelector("form").requestSubmit();
    await done;
    assertEqual(JSON.stringify(posted), JSON.stringify([{ id: 11, note: "Pinged on Teams", outcome: "again", next: "2026-11-28", today: "2026-11-27" }]));
    assertEqual(app.said.pop(), "Logged: follow up again Sat 28 Nov");
    assertTrue(!dialog.isConnected);
  } finally {
    dialog.remove();
  }
});

test("follow-ups: Close it logs and closes; r asks only the date; c closes with no dialog; Esc cancels", async () => {
  const posted = [];
  const app = fakeApp(posted);
  let done = followUpDialog(app, 12);
  let dialog = document.querySelector(".follow-up-dialog");
  dialog.querySelector('[data-value="closed"]').click();
  dialog.querySelector("form").requestSubmit();
  await done;
  assertEqual(posted.pop().outcome, "closed");
  assertEqual(app.said.pop(), "Logged and closed: Send the export");

  done = followUpDialog(app, 12, { dateOnly: true });
  dialog = document.querySelector(".follow-up-dialog");
  try {
    assertEqual(dialog.querySelector(".dialog__title").textContent, "Follow up again with Priya Shah");
    assertEqual(dialog.querySelectorAll(".dialog__input").length, 1, "only the date box");
    assertTrue(!dialog.querySelector('[role="radio"]'));
    key(document.activeElement, "Escape");
    assertEqual(await done, null);
    assertTrue(!posted.length, "Esc logs nothing");
  } finally {
    dialog.remove();
  }

  await closeFollowUp(app, 12);
  assertEqual(JSON.stringify(posted.pop()), JSON.stringify({ id: 12, note: "", outcome: "closed", next: "", today: "2026-11-27" }));
  assertTrue(!document.querySelector(".follow-up-dialog"));

  const failing = fakeApp([], { fail: "the task is not delegated" });
  done = followUpDialog(failing, 12, { dateOnly: true });
  dialog = document.querySelector(".follow-up-dialog");
  try {
    dialog.querySelector("form").requestSubmit();
    await tick();
    assertEqual(dialog.querySelector(".dialog__error").textContent, "the task is not delegated", "the server's error shows inside");
    key(document.activeElement, "Escape");
    await done;
  } finally {
    dialog.remove();
  }
});
