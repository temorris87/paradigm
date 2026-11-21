import { isTextKey, keyName, parseKeys } from "../../static/js/editor/key-names.js";
import {
  BOUND_KEYS, CMDLINE_KEYS, INSERT_KEYS, INSERT_ONLY_KEYS, MOTION_KEYS, NORMAL_KEYS, OPERATOR_KEYS, TEXT_OBJECT_KEYS, VISUAL_KEYS,
} from "../../static/js/editor/keys.js";
import { parse } from "../../static/js/editor/parser.js";
import { assertEqual, assertTrue, test } from "./harness.js";

function event(key, mods = {}) {
  return { key, code: mods.code ?? "", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods };
}

test("keyName: characters stay as typed, specials get Vim names", () => {
  assertEqual(keyName(event("a")), "a");
  assertEqual(keyName(event("A", { shiftKey: true })), "A");
  assertEqual(keyName(event(" ")), " ");
  assertEqual(keyName(event("<")), "<");
  assertEqual(keyName(event("Escape")), "<Esc>");
  assertEqual(keyName(event("Enter", { shiftKey: true })), "<CR>");
  assertEqual(keyName(event("Backspace")), "<BS>");
  assertEqual(keyName(event("ArrowLeft")), "<Left>");
  assertEqual(keyName(event("Insert", { shiftKey: true })), "<S-Insert>");
});

test("keyName: Ctrl combinations", () => {
  assertEqual(keyName(event("r", { ctrlKey: true })), "<C-r>");
  assertEqual(keyName(event("V", { ctrlKey: true, shiftKey: true })), "<C-S-v>");
  assertEqual(keyName(event("[", { ctrlKey: true })), "<Esc>");
  // A Cyrillic layout: the physical key decides.
  assertEqual(keyName(event("к", { ctrlKey: true, code: "KeyR" })), "<C-r>");
});

test("keyName: AltGr characters are text, Cmd and lone modifiers are ignored", () => {
  assertEqual(keyName(event("€", { ctrlKey: true, altKey: true })), "€");
  assertEqual(keyName(event("c", { metaKey: true })), null);
  assertEqual(keyName(event("Shift", { shiftKey: true })), null);
  assertEqual(keyName(event("Dead")), null);
  assertEqual(keyName(event("F5")), null);
});

test("parseKeys splits special names and characters", () => {
  assertEqual(parseKeys("d2w<Esc>").join(" "), "d 2 w <Esc>");
  assertEqual(parseKeys("<C-r>a<lt>").join(" "), "<C-r> a <");
  assertEqual(parseKeys("é<CR>").join(" "), "é <CR>");
  assertTrue(isTextKey("é") && isTextKey(" ") && !isTextKey("<Esc>"));
});

test("Tab and Shift-Tab are bound in insert mode only", () => {
  const outsideInsert = [...NORMAL_KEYS, ...VISUAL_KEYS, ...MOTION_KEYS, ...OPERATOR_KEYS, ...CMDLINE_KEYS];
  for (const name of ["<Tab>", "<S-Tab>"]) {
    assertTrue(INSERT_KEYS.some((entry) => entry.keys === name), name);
    assertTrue(!outsideInsert.some((entry) => entry.keys === name), name);
    assertTrue(INSERT_ONLY_KEYS.has(name), name);
  }
  assertEqual(keyName(event("Tab", { shiftKey: true })), "<S-Tab>");
});

test("browser-owned keys are not bound", () => {
  for (const name of ["<C-w>", "<C-t>", "<C-n>", "<C-S-t>"]) assertTrue(!BOUND_KEYS.has(name), name);
});

test("every key table entry has a help text and a name or alias", () => {
  for (const table of [NORMAL_KEYS, VISUAL_KEYS, MOTION_KEYS, OPERATOR_KEYS, TEXT_OBJECT_KEYS]) {
    for (const entry of table) {
      assertTrue(entry.help && (entry.name || entry.alias), `entry ${entry.keys}`);
    }
  }
});

test("no two entries in one mode share the same keys", () => {
  for (const table of [[...NORMAL_KEYS, ...OPERATOR_KEYS, ...MOTION_KEYS], [...VISUAL_KEYS, ...MOTION_KEYS, ...TEXT_OBJECT_KEYS]]) {
    const seen = new Set();
    for (const entry of table) {
      assertTrue(!seen.has(entry.keys), `duplicate ${entry.keys}`);
      seen.add(entry.keys);
    }
  }
});

function parsed(keys, scope = "normal") {
  return parse(parseKeys(keys), scope);
}

test("parser: incomplete, invalid and done", () => {
  assertEqual(parsed("d").status, "incomplete");
  assertEqual(parsed("2d3").status, "incomplete");
  assertEqual(parsed("g").status, "incomplete");
  assertEqual(parsed('"').status, "incomplete");
  assertEqual(parsed("f").status, "incomplete");
  assertEqual(parsed("dQ").status, "invalid");
  assertEqual(parsed("Q").status, "invalid");
  assertEqual(parsed("d<Esc>").status, "invalid");
  assertEqual(parsed("dw").status, "done");
});

test("parser: counts multiply and leave the body", () => {
  const { cmd } = parsed("2d3w");
  assertEqual(cmd.count, 6);
  assertEqual(cmd.body.join(""), "dw");
  assertEqual(cmd.entry.name, "delete");
  assertEqual(cmd.target.entry.name, "wordForward");
});

test("parser: 0 is a motion unless a count has started", () => {
  assertEqual(parsed("0").cmd.entry.name, "lineStart");
  assertEqual(parsed("10j").cmd.count, 10);
});

test("parser: registers, args, doubled operators, aliases", () => {
  const yank = parsed('"ayy').cmd;
  assertEqual(yank.register, "a");
  assertEqual(yank.target.entry.kind, "line");
  assertEqual(parsed("gUU").cmd.target.entry.kind, "line");
  assertEqual(parsed("gUgU").cmd.target.entry.kind, "line");
  assertEqual(parsed("dfx").cmd.target.arg, "x");
  assertEqual(parsed("rx").cmd.arg, "x");
  const alias = parsed("3x").cmd;
  assertEqual(alias.entry.name, "delete");
  assertEqual(alias.target.entry.name, "right");
  assertEqual(alias.count, 3);
  assertEqual(parsed('"_').status, "incomplete");
  assertEqual(parsed('"!').status, "invalid");
});

test("parser: visual operators act at once, text objects are targets", () => {
  assertEqual(parsed("d", "visual").cmd.entry.name, "delete");
  assertEqual(parsed("iw", "visual").cmd.entry.name, "word");
  assertEqual(parsed("i", "visual").status, "incomplete");
  assertEqual(parsed("diw").cmd.target.entry.name, "word");
});
