// Holidays, time off and sick days on the calendar: the days off (week/capacity.js), their
// room, the tray's s and the week's totals, and the grid's chip and shading.
import { GridView } from "../../static/js/calendar/grid-view.js";
import { dayCapacity, dayOff, firstFreeSlot, isWorkingDay, offChip, timeOffDays } from "../../static/js/week/capacity.js";
import { weekSummary } from "../../static/js/week/tray-model.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const assertEqual = (actual, expected, message) => same(JSON.stringify(actual), JSON.stringify(expected), message);

// Mon 23 Nov .. Sun 29 Nov 2026; Thanksgiving is Thursday 26.
const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
const WORK = { day_start: "08:00", day_end: "17:00", lunch_start: "12:00", lunch_end: "13:00" };
const TIME = {
  settings: WORK,
  upcoming: [{ day: "2026-11-26", name: "Thanksgiving" }, { day: "2026-12-25", name: "Christmas Day" }],
  time_off: [
    { id: 1, kind: "time_off", first: "2026-11-24", last: "2026-11-24", hours: 0, note: "Dentist trip" },
    { id: 2, kind: "time_off", first: "2026-11-25", last: "2026-11-25", hours: 4, note: "" },
    { id: 3, kind: "sick", first: "2026-12-01", last: "2026-12-02", hours: 0, note: "" },
  ],
};
const PTO = [
  { day: "2026-11-24", kind: "time_off", name: "Dentist trip", hours: 8 },
  { day: "2026-11-25", kind: "time_off", name: "Time off", hours: 4 },
  { day: "2026-11-26", kind: "holiday", name: "Thanksgiving", hours: 8 },
];
const EMPTY = { sessions: [] };

function settingsFor(pto = PTO, days = DAYS) {
  return { ...WORK, off: timeOffDays(TIME, pto, days) };
}

test("time off: the shown week's days off come from pto, later ones from the settings", () => {
  const off = timeOffDays(TIME, PTO, DAYS);
  assertEqual(Object.keys(off).sort(), ["2026-11-24", "2026-11-25", "2026-11-26", "2026-12-01", "2026-12-02", "2026-12-25"]);
  assertEqual(off["2026-11-24"].note, "Dentist trip", "the note is matched by kind and day");
  assertEqual(off["2026-12-01"].kind, "sick");
  assertEqual(off["2026-12-25"].hours, null, "an upcoming holiday is the whole day");
  // Removed in Settings: the week's pto no longer has it, so the day is back.
  const back = timeOffDays(TIME, PTO.filter((each) => each.day !== "2026-11-24"), DAYS);
  assertEqual("2026-11-24" in back, false, "the week's pto wins over a stale range");
  // No pto (the call failed): the settings' ranges still count.
  assertEqual(timeOffDays(TIME, null, DAYS)["2026-11-25"].hours, 4);
});

test("time off: a whole day isn't a working day; a part day shrinks its room", () => {
  const settings = settingsFor();
  assertEqual(DAYS.map((day) => isWorkingDay(day, settings)), [true, false, true, false, true, false, false]);
  assertEqual(dayOff("2026-11-23", settings), null);
  assertEqual([dayOff("2026-11-25", settings).offMin, dayOff("2026-11-25", settings).whole], [240, false]);
  assertEqual(dayCapacity(EMPTY, "2026-11-25", settings).freeMin, 240, "8 h less 4 h off");
  assertEqual(dayCapacity(EMPTY, "2026-11-23", settings).freeMin, 480);
  const total = weekSummary(EMPTY, DAYS, settings);
  assertEqual(total.freeMin, 480 + 240 + 480, "Tuesday and Thursday off, Wednesday half");
});

test("time off: the chip's label and title", () => {
  const settings = settingsFor();
  assertEqual(offChip(dayOff("2026-11-26", settings)), { label: "Thanksgiving", title: "Thanksgiving" });
  assertEqual(offChip(dayOff("2026-11-24", settings)), { label: "Time off", title: "Time off\nDentist trip" });
  assertEqual(offChip(dayOff("2026-11-25", settings)).label, "Time off · 4 h");
  assertEqual(offChip(dayOff("2026-12-01", settings)).label, "Sick");
  const quarter = { ...WORK, off: timeOffDays(TIME, [{ day: "2026-11-23", kind: "sick", name: "Sick", hours: 1.75 }], DAYS) };
  assertEqual(offChip(dayOff("2026-11-23", quarter)).label, "Sick · 1.75 h");
});

test("time off: s skips a whole day off and a part day with too little room", () => {
  const settings = settingsFor();
  const slot = firstFreeSlot(EMPTY, { length: 60, from: { day: "2026-11-24", minute: 9 * 60 }, settings });
  assertEqual(slot.day, "2026-11-25", "Tuesday is off");
  const long = firstFreeSlot(EMPTY, { length: 300, from: { day: "2026-11-25", minute: 0 }, settings });
  assertEqual(long, null, "5 h fits no single stretch, and Wednesday has only 4 h of room");
  const three = firstFreeSlot(EMPTY, { length: 180, from: { day: "2026-11-25", minute: 0 }, settings });
  assertEqual(three.day, "2026-11-25", "3 h still fits in Wednesday's 4 h");
  const late = firstFreeSlot(EMPTY, { length: 60, from: { day: "2026-11-26", minute: 0 }, settings });
  assertEqual(late.day, "2026-11-27", "Thursday's holiday is skipped");
});

test("time off: the grid's chip comes first, a whole day is shaded and says Off", () => {
  const root = document.createElement("div");
  document.body.append(root);
  try {
    const grid = new GridView(root, { onBlockDown() {}, onSlotClick() {}, onBlockMenu() {}, onChip() {} });
    const days = DAYS.slice(0, 5);
    grid.draw({
      days, blocks: [], today: "2026-11-23", now: null,
      capacity: { "2026-11-23": { workMin: 480, meetingMin: 0, focusMin: 0, freeMin: 480 },
        "2026-11-25": { workMin: 240, meetingMin: 0, focusMin: 0, freeMin: 240 } },
      chips: { "2026-11-26": [{ key: "due:1", kind: "due", label: "◆ Due · Report", noteId: 1 }] },
      off: { "2026-11-25": { label: "Time off · 4 h", title: "Time off · 4 h", whole: false },
        "2026-11-26": { label: "Thanksgiving", title: "Thanksgiving", whole: true } },
    });
    const heads = [...root.querySelectorAll(".cal-dayhead")];
    assertEqual(heads.map((head) => head.querySelector(".cal-dayhead__free")?.textContent ?? ""),
      ["8 h free", "", "4 h free", "Off", ""]);
    assertTrue(heads[3].classList.contains("cal-dayhead--off") && !heads[3].querySelector(".cal-capacity"), "no bar on a day off");
    assertTrue(!heads[2].classList.contains("cal-dayhead--off"), "a part day isn't shaded");
    const cells = [...root.querySelectorAll(".cal-allday__cell")];
    assertEqual([...cells[3].children].map((node) => node.textContent), ["Thanksgiving", "◆ Due · Report"]);
    assertTrue(cells[3].classList.contains("cal-allday__cell--off"));
    assertEqual(cells[2].querySelector(".cal-chip--off").textContent, "Time off · 4 h");
    const columns = [...root.querySelectorAll(".cal-col")];
    assertEqual(columns.map((column) => column.classList.contains("cal-col--off")), [false, false, false, true, false]);
  } finally {
    root.remove();
  }
});
