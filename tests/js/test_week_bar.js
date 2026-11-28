// The Week bar: ‹ This week › come first, so they stay under the pointer as the range changes
// width; then the range, then the tabs.
import { WeekPage } from "../../static/js/week/week-page.js";
import { assertEqual, assertTrue, test } from "./harness.js";

function page() {
  const bar = document.createElement("div");
  const node = () => document.createElement("div");
  const week = new WeekPage({ root: node(), bar, plan: node(), time: node(), oncall: node(), foot: node(),
    api: {}, today: () => new Date(2026, 10, 25) });
  return { week, bar };
}

test("week bar: the first three children are ‹ This week ›, then the range, then the tabs", () => {
  const { week, bar } = page();
  const [back, now, next, range, views] = bar.children;
  assertEqual([back, now, next].map((node) => node.tagName).join(), "BUTTON,BUTTON,BUTTON");
  assertEqual([back, now, next].map((node) => node.textContent).join("|"), "‹|This week|›");
  assertTrue(range === week.bar.range, "the range is fourth");
  assertTrue(views.classList.contains("week-bar__views"), "the tabs come after the range");
});

test("week bar: the buttons move the week and keep their place", () => {
  const { week, bar } = page();
  const calls = [];
  week.hold({ setMonday: (m) => calls.push(m) }, { setMonday() {} }, null);
  const next = bar.children[2];
  for (let i = 0; i < 5; i += 1) {
    next.click();
    assertTrue(bar.children[2] === next, "› is still third");
  }
  assertEqual(calls.at(-1), "2026-12-28", "five weeks on from 23 Nov");
  assertEqual(week.bar.range.textContent, "28 Dec 2026 – 3 Jan 2027");
  bar.children[1].click();
  assertEqual(calls.at(-1), "2026-11-23", "This week");
});
