// The Week Plan's Import panel as CalendarPage drives it, on a fake API: Plan without it (stored
// for the day, the bar's quiet note), the panel back on this week after ] then [, the panel gone
// after an upload with the focus kept on the page, a mixed upload's E: styling, and the
// gt / gc / j / k focus moves around the panel.
import { CalendarPage } from "../../static/js/calendar/calendar-page.js";
import { PLAN_WITHOUT_STORE, hasError } from "../../static/js/calendar/import-state.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Ops", kind: "area", updated_at: T },
  { id: 2, parent_id: 1, title: "Packing", updated_at: T },
  { id: 5, parent_id: 1, title: "Sync", kind: "meeting", updated_at: T },
  { id: 6, parent_id: 1, title: "Review", kind: "meeting", updated_at: T },
];
const MEETINGS = [
  { id: 5, day: "2026-11-24", time: "10:00", end_time: "10:30", cancelled: false, location: "", attendees: [] },
  { id: 6, day: "2026-11-25", time: "11:00", end_time: "11:30", cancelled: false, location: "", attendees: [] },
];
const TASKS = [{ id: 10, note_id: 2, parent_id: null, title: "Label boxes", notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: 1 }];
const NOT_IMPORTED = { imported_today: false, last_day: "2026-11-25", last_at: "2026-11-25T08:12:00" };
const IMPORTED = { imported_today: true, last_day: "2026-11-27", last_at: "2026-11-27T09:00:00" };

const tick = () => new Promise((resolve) => setTimeout(resolve));
const key = (name) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

/** A Plan tab of its own (no week page around it), today Friday 27 Nov 2026, not imported. */
async function planPage({ status = NOT_IMPORTED, stored = {}, upload, pending = [] } = {}) {
  const root = document.createElement("div");
  root.tabIndex = -1;
  const bar = document.createElement("div");
  const side = document.createElement("aside");
  const cell = document.createElement("div");
  const week = document.createElement("section");
  cell.append(week);
  root.append(bar, side, cell);
  document.body.append(root);
  const state = { status, sent: [], uploads: [], pending };
  const storage = { getItem: (name) => stored[name] ?? null, setItem: (name, value) => { stored[name] = String(value); } };
  const api = {
    notes: { list: async () => NOTES },
    meetings: { list: async () => MEETINGS },
    tasks: { list: async () => TASKS, sessions: async () => [] },
    calendar: {
      pending: async () => state.pending,
      status: async () => state.status,
      file: async (ids, hubId) => {
        state.filed = { ids, hubId };
        state.pending = state.pending.filter((event) => !ids.includes(event.id));
      },
      ignore: async (ids) => {
        state.ignored = ids;
        state.pending = state.pending.filter((event) => !ids.includes(event.id));
      },
      upload: upload ?? (async (file) => {
        state.uploads.push(file.name);
        state.status = IMPORTED;
        return { new: 2 };
      }),
    },
  };
  const changes = { listen() {}, send: (message) => state.sent.push(message) };
  const page = new CalendarPage({ root, bar, side, week, api, changes, storage, today: () => new Date(2026, 10, 27, 10, 0) });
  await page.start();
  return { page, root, bar, week, stored, state, panel: cell.querySelector(".import-panel") };
}

const button = (node, text) => [...node.querySelectorAll("button")].find((each) => each.textContent.startsWith(text));

test("import wiring: not imported, this week greys under the panel and the bar has no quiet note", async () => {
  const { page, root, bar, week, panel } = await planPage();
  try {
    assertTrue(!panel.hidden && week.inert, "the panel over an inert grid");
    assertEqual(bar.querySelector(".cal-bar__note").textContent, "");
  } finally {
    root.remove();
  }
  assertTrue(page.panel.shown);
});

test("import wiring: Plan without it stores today, hides the panel and leaves the quiet note", async () => {
  const { root, bar, week, panel, stored } = await planPage();
  try {
    button(panel, "Plan without it").click();
    assertEqual(stored[PLAN_WITHOUT_STORE], "2026-11-27");
    assertTrue(panel.hidden && !week.inert, "the grid is live again");
    assertEqual(bar.querySelector(".cal-bar__note").textContent, "Not imported today · i");
    assertTrue(document.activeElement === root, "the page keeps the focus");
  } finally {
    root.remove();
  }
});

test("import wiring: planned without on another day, the panel is back", async () => {
  const { root, panel } = await planPage({ stored: { [PLAN_WITHOUT_STORE]: "2026-11-26" } });
  try {
    assertTrue(!panel.hidden);
  } finally {
    root.remove();
  }
});

test("import wiring: ] hides the panel on next week, [ brings it back on this one", async () => {
  const { root, panel } = await planPage();
  try {
    root.focus();
    key("]");
    await tick();
    assertTrue(panel.hidden, "next week is planned as it is");
    key("[");
    await tick();
    assertTrue(!panel.hidden, "this week greys again");
  } finally {
    root.remove();
  }
});

test("import wiring: an upload from the panel's own button hides it and the page keeps the focus", async () => {
  const { page, root, panel, state } = await planPage();
  try {
    root.focus();
    key("g");
    key("c");
    assertTrue(document.activeElement === button(panel, "Import a file"), "gc: the panel's Import a file…");
    await page.uploadFiles([new File(["BEGIN:VCALENDAR"], "week.ics", { type: "text/calendar" })]);
    assertEqual(state.uploads.join(), "week.ics");
    assertTrue(panel.hidden, "imported today: the panel goes");
    assertTrue(document.activeElement === root, "the focus is on the page, not the body");
    assertEqual(root.querySelector(".cal-bar__status").textContent, "Imported 2 meetings from week.ics");
    assertEqual(state.sent.map((each) => each.type).join(), "changed");
    key("g");
    key("t");
    assertTrue(document.activeElement?.classList.contains("cal-task"), "gt still reaches the tray");
  } finally {
    root.remove();
  }
});

test("import wiring: a mixed upload shows its E: part as an error, and the panel goes", async () => {
  const upload = async (file) => {
    if (file.name === "b.ics") throw new Error("not a calendar file");
    return { new: 2 };
  };
  const { page, root, panel, state } = await planPage({ upload: async (file) => {
    const counts = await upload(file);
    state.status = IMPORTED;
    return counts;
  } });
  try {
    await page.uploadFiles([new File(["x"], "a.ics"), new File(["x"], "b.ics")]);
    const status = root.querySelector(".cal-bar__status");
    assertEqual(status.textContent, "Imported 2 meetings from a.ics. E: not a calendar file: b.ics");
    assertTrue(status.classList.contains("cal-bar__status--due"), "styled as an error");
    assertTrue(panel.hidden);
  } finally {
    root.remove();
  }
});

test("import wiring: a failed upload keeps the panel up", async () => {
  const { page, root, panel } = await planPage({ upload: async () => { throw new Error("not a calendar file"); } });
  try {
    await page.uploadFiles([new File(["x"], "notes.ics")]);
    const status = root.querySelector(".cal-bar__status");
    assertEqual(status.textContent, "E: not a calendar file: notes.ics");
    assertTrue(status.classList.contains("cal-bar__status--due"));
    assertTrue(!panel.hidden, "nothing went in");
  } finally {
    root.remove();
  }
});

test("import wiring: gt, then j / k in the tray, gc back to the panel; j / k do nothing on the panel", async () => {
  const { root, panel } = await planPage();
  try {
    root.focus();
    key("g");
    key("t");
    assertTrue(document.activeElement?.classList.contains("cal-task"), "gt: the tray's first task");
    key("j");
    assertTrue(document.activeElement?.classList.contains("cal-task"), "j stays in the tray");
    key("g");
    key("c");
    const pick = button(panel, "Import a file");
    assertTrue(document.activeElement === pick, "gc: the panel's button while it greys the grid");
    key("j");
    assertTrue(document.activeElement === pick, "no blocks to move to under the panel");
  } finally {
    root.remove();
  }
});

test("import wiring: imported, gc and j / k move through the week's blocks", async () => {
  const { page, root } = await planPage({ status: IMPORTED });
  try {
    root.focus();
    key("g");
    key("c");
    assertEqual(page.grid.focusedKey(), "meeting:5", "gc: the first block");
    key("j");
    assertEqual(page.grid.focusedKey(), "meeting:6", "j: the next");
    key("k");
    assertEqual(page.grid.focusedKey(), "meeting:5", "k: back");
  } finally {
    root.remove();
  }
});

test("import wiring: hasError finds an E: part alone or after an import", () => {
  assertTrue(hasError("E: not a calendar file: notes.ics"));
  assertTrue(hasError("Imported 2 meetings from a.ics. E: not a calendar file: b.ics"));
  assertTrue(!hasError("Imported 2 meetings from a.ics"));
  assertTrue(!hasError(""));
});

test("import wiring: Don't import tells the other windows, so Today's to file rows drop it", async () => {
  const { page, root, state } = await planPage({ status: IMPORTED });
  try {
    await page.ignore([7]);
    assertEqual(state.ignored.join(), "7");
    assertEqual(state.sent.map((each) => `${each.type} ${each.what.join("+")}`).join(), "changed meetings");
  } finally {
    root.remove();
  }
});

const waiting = (id, title, hubGuess = null) => ({ id, title, day: "2026-11-30", time: "09:00", end_time: "09:30", recurring: false,
  location: "", hub_guess: hubGuess });

test("import wiring: after Don't import in To file, the focus is on the next row, the previous, then the list", async () => {
  const { page, root, state } = await planPage({ status: IMPORTED, pending: [waiting(7, "Standup"), waiting(8, "Review"), waiting(9, "Retro")] });
  const list = root.querySelector(".cal-side__list--file");
  const ignoreOf = (title) => [...list.querySelectorAll(".cal-file")].find((row) => row.textContent.includes(title))
    .querySelector("[data-focus-key^='file-ignore-']");
  const dontImport = async (title) => {
    const node = ignoreOf(title);
    node.focus();
    node.click();
    for (let round = 0; round < 5; round += 1) await tick();
  };
  try {
    page.side.show("file");
    await dontImport("Review");
    assertEqual(state.ignored.join(), "8");
    assertTrue(document.activeElement === ignoreOf("Retro"), "the next row's Don't import has the focus");
    await dontImport("Retro");
    assertTrue(document.activeElement === ignoreOf("Standup"), "the last gone: the previous row's");
    await dontImport("Standup");
    assertTrue(document.activeElement === list, "none left: the list itself");
  } finally {
    root.remove();
  }
});

/** The To file list of a Plan tab, and a way to click a row's button and let the redraw land. */
function fileRows(root) {
  const list = root.querySelector(".cal-side__list--file");
  const rowOf = (title) => [...list.querySelectorAll(".cal-file")].find((row) => row.querySelector(".cal-file__title").textContent === title);
  const buttonOf = (title, text) => button(rowOf(title), text);
  const press = async (title, text) => {
    const node = buttonOf(title, text);
    node.focus();
    node.click();
    for (let round = 0; round < 5; round += 1) await tick();
  };
  return { list, buttonOf, press };
}

test("import wiring: after File in To file, the focus is on the next row's File, the previous, then the list", async () => {
  const { page, root, state } = await planPage({ status: IMPORTED,
    pending: [waiting(7, "Standup", 1), waiting(8, "Review", 1), waiting(9, "Retro", 1)] });
  const { list, buttonOf, press } = fileRows(root);
  try {
    page.side.show("file");
    await press("Review", "File");
    assertEqual(`${state.filed.ids.join()} in ${state.filed.hubId}`, "8 in 1");
    assertTrue(document.activeElement === buttonOf("Retro", "File"), "the next row's File has the focus");
    await press("Retro", "File");
    assertTrue(document.activeElement === buttonOf("Standup", "File"), "the last gone: the previous row's");
    await press("Standup", "File");
    assertTrue(document.activeElement === list, "none left: the list itself");
  } finally {
    root.remove();
  }
});

test("import wiring: after File all in To file, the focus skips the rows filed with it to the next one left", async () => {
  const { page, root, state } = await planPage({ status: IMPORTED,
    pending: [waiting(7, "Standup", 1), waiting(8, "Sync", 1), waiting(9, "Standup", 1), waiting(10, "Retro", 1)] });
  const { list, buttonOf, press } = fileRows(root);
  try {
    page.side.show("file");
    // Filed from the first Standup: the second goes too, so the next row left is Sync.
    await press("Standup", "File all 2");
    assertEqual(state.filed.ids.join(), "7,9");
    assertTrue(document.activeElement === buttonOf("Sync", "File"), "the next row left's File has the focus");
    assertTrue(list.querySelectorAll(".cal-file").length === 2);
  } finally {
    root.remove();
  }
});

test("import wiring: after File all from the last rows, the focus goes back to the row before them", async () => {
  const { page, root } = await planPage({ status: IMPORTED,
    pending: [waiting(7, "Sync", 1), waiting(8, "Standup", 1), waiting(9, "Standup", 1)] });
  const { buttonOf, press } = fileRows(root);
  try {
    page.side.show("file");
    await press("Standup", "File all 2");
    assertTrue(document.activeElement === buttonOf("Sync", "File"), "no row after: the one before");
  } finally {
    root.remove();
  }
});

test("import wiring: the To plan filters are hidden on the To file tab (their display rule keeps [hidden])", async () => {
  const css = await (await fetch(new URL("../../static/css/calendar.css", import.meta.url))).text();
  assertTrue(/\.cal-side__filters\[hidden\]\s*\{\s*display:\s*none/.test(css),
    ".cal-side__filters sets display: flex, so without its own [hidden] rule the filters show on To file");
});
