// The shared status chip (static/js/ui/chip.js) and its tones (chip-tones.js).
import { chip, setChipTone } from "../../static/js/ui/chip.js";
import { CHIP_TONES, toneOf } from "../../static/js/ui/chip-tones.js";
import { assertEqual, assertTrue, test } from "./harness.js";

test("chip tones: each state and kind to its tone; unknown is neutral", () => {
  const cases = [
    ["overdue", "danger"], ["late", "danger"], ["blocked", "danger"],
    ["due today", "caution"], ["Due soon", "caution"], ["due", "caution"],
    ["follow-up", "info"], ["followup", "info"], ["waiting on", "info"],
    ["at_risk", "warning"], ["on_track", "success"], ["On track", "success"],
    ["on_hold", "neutral"], ["day", "neutral"], ["none", "neutral"],
    ["task", "task"], ["Decision", "decision"], ["question", "question"], ["asked", "question"], ["meeting", "meeting"],
    ["something else", "neutral"], [undefined, "neutral"],
  ];
  for (const [name, tone] of cases) assertEqual(toneOf(name), tone, String(name));
  assertTrue(cases.every(([, tone]) => CHIP_TONES.includes(tone)), "every tone is in the list");
});

test("chip tones: a follow-up stays info however late; only a missed due date is danger", () => {
  assertEqual(toneOf("follow-up"), "info");
  assertEqual(toneOf("overdue"), "danger");
});

test("chip: a span in its tone, with a dot when asked; a pressable one is a button", () => {
  const plain = chip("On track", "success");
  assertEqual(plain.tagName, "SPAN");
  assertEqual(plain.className, "chip chip--success");
  assertEqual(plain.textContent, "On track");
  assertEqual(plain.querySelector(".chip__dot"), null);
  const dotted = chip("Blocked", "danger", { dot: true, title: "why" });
  assertTrue(dotted.firstChild.classList.contains("chip__dot"), "the dot comes first");
  assertEqual(dotted.textContent, "Blocked", "the dot adds no text");
  assertEqual(dotted.title, "why");
  assertEqual(chip("x", "nonsense").className, "chip chip--neutral");
  const pill = chip("Everyone · 3", "neutral", { tag: "button" });
  assertEqual(pill.tagName, "BUTTON");
  assertEqual(pill.type, "button");
  setChipTone(pill, "info");
  assertEqual(pill.className, "chip chip--info");
});

test("chip: the CSS draws each tone from the state and kind tokens", async () => {
  const text = await (await fetch("../../static/css/chip.css")).text();
  for (const tone of CHIP_TONES) assertTrue(text.includes(`.chip--${tone} {`), tone);
  assertTrue(text.includes("--chip-bg: var(--state-danger-bg)"));
  assertTrue(text.includes("--chip-bg: var(--kind-question-bg)"));
  assertTrue(text.includes("--chip-bg: var(--surface-sunken); --chip-fg: var(--text-dim)"), "neutral");
});
