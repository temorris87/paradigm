// The editor's key table: the one place that says which keys do what. The parser dispatches
// from it, and any help listing must be built from it too.
//
// Entry fields:
//   keys    the key sequence in Vim notation ("gg", "<C-d>")
//   name    the function it runs (in motions.js, text-objects.js, operators.js, actions.js...)
//   help    a short description for help listings
//   arg     true when one more key follows (f{char}, r{char}, m{a-z})
//   change  true when the command changes text, so "." can repeat it
//   alias   instead of name: the keys it stands for ("x" is "dl")
//   cmdline true for / and ?, which read a pattern before they act
import { isTextKey, parseKeys } from "./key-names.js";

const motion = (keys, name, help, extra = {}) => ({ keys, kind: "motion", name, help, ...extra });
const operator = (keys, name, help) => ({ keys, kind: "operator", name, help, change: name !== "yank" });
const action = (keys, name, help, extra = {}) => ({ keys, kind: "action", name, help, ...extra });
const alias = (keys, target, help) => ({ keys, kind: "alias", alias: target, help });
const object = (keys, name, around, help) => ({ keys, kind: "textobject", name, around, help });
const key = (keys, name, help, extra = {}) => ({ keys, name, help, ...extra });

export const MOTION_KEYS = [
  motion("h", "left", "left"),
  motion("<Left>", "left", "left"),
  motion("<BS>", "backspaceLeft", "left, on to the line above"),
  motion("<C-h>", "backspaceLeft", "left, on to the line above"),
  motion("l", "right", "right"),
  motion("<Right>", "right", "right"),
  motion(" ", "spaceRight", "right, on to the line below"),
  motion("j", "down", "down a line"),
  motion("<Down>", "down", "down a line"),
  motion("k", "up", "up a line"),
  motion("<Up>", "up", "up a line"),
  motion("gj", "screenDown", "down a screen row"),
  motion("gk", "screenUp", "up a screen row"),
  motion("0", "lineStart", "start of the line"),
  motion("<Home>", "lineStart", "start of the line"),
  motion("^", "firstNonBlank", "first non-blank of the line"),
  motion("$", "lineEnd", "end of the line"),
  motion("<End>", "lineEnd", "end of the line"),
  motion("g_", "lastNonBlank", "last non-blank of the line"),
  motion("|", "column", "column [count]"),
  motion("+", "nextLineStart", "first non-blank of the next line"),
  motion("<CR>", "nextLineStart", "first non-blank of the next line"),
  motion("-", "prevLineStart", "first non-blank of the line above"),
  motion("_", "currentLineStart", "first non-blank, [count]-1 lines down"),
  motion("w", "wordForward", "next word"),
  motion("W", "bigWordForward", "next WORD"),
  motion("b", "wordBackward", "previous word"),
  motion("B", "bigWordBackward", "previous WORD"),
  motion("e", "wordEnd", "end of word"),
  motion("E", "bigWordEnd", "end of WORD"),
  motion("ge", "wordEndBackward", "end of previous word"),
  motion("gE", "bigWordEndBackward", "end of previous WORD"),
  motion("gg", "firstLine", "first line (or line [count])"),
  motion("G", "lastLine", "last line (or line [count])"),
  motion("f", "findForward", "to the next {char} on the line", { arg: true }),
  motion("F", "findBackward", "to the previous {char} on the line", { arg: true }),
  motion("t", "tillForward", "till before the next {char}", { arg: true }),
  motion("T", "tillBackward", "till after the previous {char}", { arg: true }),
  motion(";", "repeatFind", "repeat the last f F t T"),
  motion(",", "repeatFindReverse", "repeat the last f F t T backwards"),
  motion("%", "matchPair", "matching bracket ([count]% : that percent of the file)"),
  motion("}", "paragraphForward", "next paragraph"),
  motion("{", "paragraphBackward", "previous paragraph"),
  motion(")", "sentenceForward", "next sentence"),
  motion("(", "sentenceBackward", "previous sentence"),
  motion("H", "screenTop", "top of the screen"),
  motion("M", "screenMiddle", "middle of the screen"),
  motion("L", "screenBottom", "bottom of the screen"),
  motion("/", "searchForward", "search forward", { cmdline: true }),
  motion("?", "searchBackward", "search backward", { cmdline: true }),
  motion("n", "searchNext", "next match"),
  motion("N", "searchPrev", "previous match"),
  motion("*", "searchWordForward", "search forward for the word under the cursor"),
  motion("#", "searchWordBackward", "search backward for the word under the cursor"),
  motion("'", "markLine", "line of mark {a-z}", { arg: true }),
  motion("`", "markExact", "position of mark {a-z}", { arg: true }),
];

export const OPERATOR_KEYS = [
  operator("d", "delete", "delete"),
  operator("c", "change", "change"),
  operator("y", "yank", "yank (copy)"),
  operator(">", "shiftRight", "indent"),
  operator("<", "shiftLeft", "unindent"),
  operator("gu", "lower", "make lowercase"),
  operator("gU", "upper", "make uppercase"),
  operator("g~", "toggleCase", "switch case"),
];

export const TEXT_OBJECT_KEYS = [
  object("iw", "word", false, "inner word"),
  object("aw", "word", true, "a word"),
  object("iW", "bigWord", false, "inner WORD"),
  object("aW", "bigWord", true, "a WORD"),
  object("is", "sentence", false, "inner sentence"),
  object("as", "sentence", true, "a sentence"),
  object("ip", "paragraph", false, "inner paragraph"),
  object("ap", "paragraph", true, "a paragraph"),
  object('i"', "doubleQuote", false, 'inside "..."'),
  object('a"', "doubleQuote", true, 'a "..." string'),
  object("i'", "singleQuote", false, "inside '...'"),
  object("a'", "singleQuote", true, "a '...' string"),
  object("i`", "backQuote", false, "inside `...`"),
  object("a`", "backQuote", true, "a `...` string"),
  object("i(", "paren", false, "inside ( )"),
  object("i)", "paren", false, "inside ( )"),
  object("ib", "paren", false, "inside ( )"),
  object("a(", "paren", true, "a ( ) block"),
  object("a)", "paren", true, "a ( ) block"),
  object("ab", "paren", true, "a ( ) block"),
  object("i[", "square", false, "inside [ ]"),
  object("i]", "square", false, "inside [ ]"),
  object("a[", "square", true, "a [ ] block"),
  object("a]", "square", true, "a [ ] block"),
  object("i{", "brace", false, "inside { }"),
  object("i}", "brace", false, "inside { }"),
  object("iB", "brace", false, "inside { }"),
  object("a{", "brace", true, "a { } block"),
  object("a}", "brace", true, "a { } block"),
  object("aB", "brace", true, "a { } block"),
  object("i<", "angle", false, "inside < >"),
  object("i>", "angle", false, "inside < >"),
  object("a<", "angle", true, "a < > block"),
  object("a>", "angle", true, "a < > block"),
];

// Scrolling works the same in normal and visual mode.
const SCROLL_KEYS = [
  action("<C-d>", "halfPageDown", "scroll half a screen down"),
  action("<C-u>", "halfPageUp", "scroll half a screen up"),
  action("<C-f>", "pageDown", "scroll a screen down"),
  action("<PageDown>", "pageDown", "scroll a screen down"),
  action("<C-b>", "pageUp", "scroll a screen up"),
  action("<PageUp>", "pageUp", "scroll a screen up"),
  action("<C-e>", "scrollDown", "scroll a line down"),
  action("<C-y>", "scrollUp", "scroll a line up"),
  action("zz", "scrollCenter", "cursor line to the middle of the screen"),
  action("z.", "scrollCenterStart", "cursor line to the middle, first non-blank"),
  action("zt", "scrollTop", "cursor line to the top of the screen"),
  action("z<CR>", "scrollTopStart", "cursor line to the top, first non-blank"),
  action("zb", "scrollBottom", "cursor line to the bottom of the screen"),
  action("z-", "scrollBottomStart", "cursor line to the bottom, first non-blank"),
];

export const NORMAL_KEYS = [
  alias("x", "dl", "delete the character under the cursor"),
  alias("<Del>", "dl", "delete the character under the cursor"),
  alias("X", "dh", "delete the character before the cursor"),
  alias("D", "d$", "delete to the end of the line"),
  alias("C", "c$", "change to the end of the line"),
  alias("s", "cl", "change the character under the cursor"),
  alias("S", "cc", "change the whole line"),
  alias("Y", "yy", "yank the whole line"),
  action("p", "putAfter", "put after the cursor", { change: true }),
  action("P", "putBefore", "put before the cursor", { change: true }),
  action("gp", "putAfterMove", "put after, cursor after the new text", { change: true }),
  action("gP", "putBeforeMove", "put before, cursor after the new text", { change: true }),
  action("i", "insert", "insert before the cursor", { change: true }),
  action("<Insert>", "insert", "insert before the cursor", { change: true }),
  action("a", "append", "append after the cursor", { change: true }),
  action("I", "insertLineStart", "insert at the first non-blank", { change: true }),
  action("gI", "insertColumnZero", "insert at column 1", { change: true }),
  action("A", "appendLineEnd", "append at the end of the line", { change: true }),
  action("o", "openBelow", "open a line below", { change: true }),
  action("O", "openAbove", "open a line above", { change: true }),
  action("gi", "insertAtLastInsert", "insert where insert mode last stopped", { change: true }),
  action("R", "replaceMode", "replace mode", { change: true }),
  action("r", "replaceChar", "replace the character under the cursor", { arg: true, change: true }),
  action("~", "toggleCaseChar", "switch case of the character under the cursor", { change: true }),
  action("J", "join", "join lines", { change: true }),
  action("gJ", "joinRaw", "join lines without changing spaces", { change: true }),
  action("<C-a>", "increment", "add [count] to the number at or after the cursor", { change: true }),
  action("<C-x>", "decrement", "subtract [count] from the number at or after the cursor", { change: true }),
  action("u", "undo", "undo"),
  action("<C-r>", "redo", "redo"),
  action(".", "repeat", "repeat the last change"),
  action("v", "visualChar", "visual mode"),
  action("V", "visualLine", "visual line mode"),
  action("<C-v>", "visualBlock", "visual block mode"),
  action("gv", "reselect", "select the last visual area again"),
  action(":", "cmdline", "command line"),
  action("m", "setMark", "set mark {a-z}", { arg: true }),
  action("ZZ", "writeQuit", "save and quit (same as :x)"),
  action("ZQ", "quitForce", "quit without saving (same as :q!)"),
  ...SCROLL_KEYS,
];

export const VISUAL_KEYS = [
  action("<Esc>", "exitVisual", "leave visual mode"),
  action("<C-c>", "exitVisual", "leave visual mode"),
  action("v", "visualChar", "switch to (or leave) visual mode"),
  action("V", "visualLine", "switch to (or leave) visual line mode"),
  action("<C-v>", "visualBlock", "switch to (or leave) visual block mode"),
  action("o", "swapEnds", "go to the other end of the selection"),
  action("O", "swapCorners", "go to the other corner (block) or end"),
  operator("d", "delete", "delete"),
  operator("x", "delete", "delete"),
  operator("<Del>", "delete", "delete"),
  operator("c", "change", "change"),
  operator("s", "change", "change"),
  operator("y", "yank", "yank (copy)"),
  operator(">", "shiftRight", "indent ([count] times)"),
  operator("<", "shiftLeft", "unindent ([count] times)"),
  operator("u", "lower", "make lowercase"),
  operator("U", "upper", "make uppercase"),
  operator("~", "toggleCase", "switch case"),
  operator("gu", "lower", "make lowercase"),
  operator("gU", "upper", "make uppercase"),
  operator("g~", "toggleCase", "switch case"),
  action("X", "deleteLines", "delete the lines", { change: true }),
  action("D", "deleteToEnd", "delete the lines (block: to the end of each line)", { change: true }),
  action("S", "changeLines", "change the lines", { change: true }),
  action("R", "changeLines", "change the lines", { change: true }),
  action("C", "changeToEnd", "change the lines (block: to the end of each line)", { change: true }),
  action("Y", "yankLines", "yank the lines"),
  action("r", "replaceSelection", "replace every selected character with {char}", { arg: true, change: true }),
  action("J", "join", "join the lines", { change: true }),
  action("gJ", "joinRaw", "join the lines without changing spaces", { change: true }),
  action("p", "putReplace", "replace the selection with a register", { change: true }),
  action("P", "putReplaceKeep", "replace the selection, keep the register", { change: true }),
  action("I", "blockInsert", "block: insert on every line", { change: true }),
  action("A", "blockAppend", "block: append on every line", { change: true }),
  action(":", "cmdlineRange", "command line on the selected lines"),
  ...SCROLL_KEYS,
];

export const INSERT_KEYS = [
  key("<Esc>", "leave", "back to normal mode"),
  key("<C-c>", "leave", "back to normal mode"),
  key("<CR>", "newline", "new line (keeps the indent)"),
  key("<Tab>", "tab", "spaces to the next indent stop (shiftwidth)"),
  key("<S-Tab>", "unindent", "take one indent step off the line"),
  key("<BS>", "backspace", "delete the character before the cursor"),
  key("<C-h>", "backspace", "delete the character before the cursor"),
  key("<Del>", "deleteChar", "delete the character under the cursor"),
  key("<C-u>", "deleteToStart", "delete the text typed before the cursor"),
  key("<C-r>", "insertRegister", "insert the contents of register {r}", { arg: true }),
  key("<C-o>", "oneCommand", "run one normal-mode command"),
  key("<Left>", "moveLeft", "cursor left"),
  key("<Right>", "moveRight", "cursor right"),
  key("<Up>", "moveUp", "cursor up"),
  key("<Down>", "moveDown", "cursor down"),
  key("<Home>", "moveHome", "start of the line"),
  key("<End>", "moveEnd", "end of the line"),
];

export const CMDLINE_KEYS = [
  key("<Esc>", "cancel", "abandon the command line"),
  key("<C-c>", "cancel", "abandon the command line"),
  key("<CR>", "execute", "run the command / search"),
  key("<BS>", "backspace", "delete the character before the cursor"),
  key("<C-h>", "backspace", "delete the character before the cursor"),
  key("<C-u>", "clear", "delete everything typed"),
  key("<C-r>", "insertRegister", "insert the contents of register {r}", { arg: true }),
  key("<Up>", "historyBack", "older entry from history"),
  key("<Down>", "historyForward", "newer entry from history"),
];

for (const table of [MOTION_KEYS, OPERATOR_KEYS, TEXT_OBJECT_KEYS, NORMAL_KEYS, VISUAL_KEYS, INSERT_KEYS, CMDLINE_KEYS]) {
  for (const entry of table) entry.seq = parseKeys(entry.keys);
}

/** What the parser matches against in each mode. */
export const NORMAL_TABLE = [...NORMAL_KEYS, ...OPERATOR_KEYS, ...MOTION_KEYS];
export const VISUAL_TABLE = [...VISUAL_KEYS, ...MOTION_KEYS, ...TEXT_OBJECT_KEYS];
export const OPERATOR_TARGETS = [...MOTION_KEYS, ...TEXT_OBJECT_KEYS];

export function findKey(table, name) {
  return table.find((entry) => entry.keys === name) ?? null;
}

/**
 * Tab and Shift-Tab are editor keys only in insert and replace mode; anywhere else they
 * move the focus on, like on any web page.
 */
export const INSERT_ONLY_KEYS = new Set(["<Tab>", "<S-Tab>"]);

/**
 * Every non-character key the editor binds anywhere. The editor element calls
 * preventDefault only for these, so other Ctrl shortcuts still reach the browser.
 */
export const BOUND_KEYS = new Set(
  [MOTION_KEYS, OPERATOR_KEYS, NORMAL_KEYS, VISUAL_KEYS, INSERT_KEYS, CMDLINE_KEYS]
    .flatMap((table) => table.flatMap((entry) => entry.seq))
    .filter((name) => !isTextKey(name)),
);
