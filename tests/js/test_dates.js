import { dayText, daysAgo, timeSpan, weekRange, whenText } from "../../static/js/ui/dates.js";
import { assertEqual, test } from "./harness.js";

test("dates: one way to show a day", () => {
  const today = "2026-11-22";
  assertEqual(dayText("2026-11-25", { today }), "Wed 25 Nov");
  assertEqual(dayText("2027-01-04", { today }), "Mon 4 Jan 2027", "another year shows it");
  assertEqual(dayText("2026-11-25", { today, weekday: false }), "25 Nov");
  assertEqual(dayText("2026-11-23", { today, relative: true }), "tomorrow");
  assertEqual(dayText("2026-11-21", { today, relative: true }), "yesterday");
  assertEqual(dayText("2026-11-22", { today, relative: true }), "today");
  assertEqual(dayText("2026-11-30", { today, relative: true }), "Mon 30 Nov");
  assertEqual(dayText("", { today }), "");
  assertEqual(dayText("2026-11-26", { today, month: false }), "Thu 26", "under its week's heading");
  assertEqual(dayText("2026-11-22", { today: new Date(2026, 10, 22), relative: true }), "today", "today as a Date");
});

test("dates: times, meetings, weeks, ages", () => {
  assertEqual(timeSpan("14:00", "15:00"), "14:00–15:00");
  assertEqual(timeSpan("09:00"), "09:00");
  assertEqual(whenText({ day: "2026-11-25", time: "14:00", end_time: "15:00" }, "2026-11-22"), "Wed 25 Nov 14:00–15:00");
  assertEqual(weekRange("2026-11-16"), "16–22 Nov 2026");
  assertEqual(weekRange("2026-11-30"), "30 Nov – 6 Dec 2026");
  assertEqual(weekRange("2026-12-28"), "28 Dec 2026 – 3 Jan 2027");
  assertEqual(weekRange("2026-11-23", "2026-11-27", { year: false }), "23–29 Nov", "this year's left out");
  assertEqual(weekRange("2026-12-28", "2026-11-27", { year: false }), "28 Dec 2026 – 3 Jan 2027", "the first year too when they differ");
  assertEqual(daysAgo("2026-11-10", "2026-11-22"), "12 d ago");
  assertEqual(daysAgo("2026-11-22", "2026-11-22"), "today");
});
