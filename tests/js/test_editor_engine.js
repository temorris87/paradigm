// Engine behaviour that the Vim comparison cannot check: undo steps, registers, events,
// errors and the command line.
import { Vim } from "../../static/js/editor/vim.js";
import { assertEqual, assertTrue, test } from "./harness.js";
import { run, show, type, vimAt } from "./editor-helpers.js";

test("undo: each command is one step", () => {
  assertEqual(run("|foo bar", "xxxu"), "|o bar");
  assertEqual(run("|foo bar", "xxx2u"), "|oo bar");
  assertEqual(run("|foo bar", "xxxuuu"), "|foo bar");
  assertEqual(run("|foo bar baz", "dwdwuu<C-r>"), "|bar baz");
});

test("undo: one insert session is one step, and the cursor returns", () => {
  assertEqual(run("|foo", "ia<Esc>ib<Esc>u"), "|afoo");
  assertEqual(run("|foo", "ia<Esc>ib<Esc>uu<C-r>"), "|afoo");
  assertEqual(run("|foo", "cwnew<CR>text<Esc>u"), "|foo");
  assertEqual(run("a\n|b\nc", "ddjpu"), "a\n|c");
});

test("undo: nothing to undo or redo says so", () => {
  const vim = type(vimAt("|foo"), "u");
  assertEqual(vim.message.text, "Already at oldest change");
  type(vim, "<C-r>");
  assertEqual(vim.message.text, "Already at newest change");
});

test("undo: a new change drops the redo branch", () => {
  assertEqual(run("|abc", "xux<C-r>"), "|bc");
  assertEqual(type(vimAt("|abc"), "xux<C-r>").message.text, "Already at newest change");
});

test("repeat: . replays an insert with its text, and takes a new count", () => {
  assertEqual(run("|a\nb\nc", "Ax<Esc>j.j."), "ax\nbx\nc|x");
  assertEqual(run("|abc", "ix<Esc>3."), "xx|xxabc");
  assertEqual(run("|one two three four", "dw2."), "|four");
});

test("repeat: . after a visual change works on the same amount of text", () => {
  assertEqual(run("|abcdef", "vlx."), "|ef");
  assertEqual(run("|a\nb\nc\nd\ne", "Vjd."), "|e");
});

test("repeat: . after d/pattern<CR> searches again", () => {
  assertEqual(run("|a x b x c x", "d/x<CR>."), "|x c x");
});

test("registers: numbered registers shift on line deletes", () => {
  const vim = type(vimAt("|one\ntwo\nthree\nfour"), "dddddd");
  assertEqual(vim.registers.get("1").text, "three");
  assertEqual(vim.registers.get("2").text, "two");
  assertEqual(vim.registers.get("3").text, "one");
});

test("registers: small deletes go to -, yanks to 0, black hole to nowhere", () => {
  const vim = type(vimAt("|foo bar baz"), 'yiwwdw"_dw');
  assertEqual(vim.registers.get("0").text, "foo");
  assertEqual(vim.registers.get("-").text, "bar ");
  assertEqual(vim.registers.get('"').text, "bar ");
});

test("registers: uppercase appends", () => {
  const vim = type(vimAt("|foo bar"), '"ayiww"Ayiw');
  assertEqual(vim.registers.get("a").text, "foobar");
});

test("registers: + and * write the system clipboard and read its cache", () => {
  const written = [];
  const vim = type(vimAt("|foo\nbar", { clipboard: { writeText: (text) => written.push(text) } }), '"+yy');
  assertEqual(written.join("|"), "foo\n");
  vim.registers.setClipboardText("pasted");
  type(vim, '"+P');
  assertEqual(show(vim), "paste|dfoo\nbar");
  vim.registers.setClipboardText("a line\n");
  type(vim, '"*p');
  assertEqual(show(vim), "pastedfoo\n|a line\nbar");
});

test("registers: putting an empty register is an error", () => {
  const vim = type(vimAt("|foo"), '"qp');
  assertEqual(vim.message.text, "E353: Nothing in register q");
  assertEqual(vim.text, "foo");
});

test("insert: Ctrl-R pastes a register, Ctrl-U deletes what was typed", () => {
  assertEqual(run("|foo", 'yiwA <C-r>"<Esc>'), "foo fo|o");
  assertEqual(run("  |foo", "A bar<C-u><Esc>"), "  fo|o");
  assertEqual(run("  foo|", "a<C-u><C-u><Esc>"), "|");
});

test("insert: arrow keys move, and the count only repeats what comes after", () => {
  assertEqual(run("|ab", "3ix<Left>y<Esc>"), "|yxab");
});

test("insert: Ctrl-O runs one command, then insert resumes", () => {
  const vim = type(vimAt("|foo bar"), "ix<C-o>");
  assertEqual(vim.mode, "normal");
  assertTrue(vim.insertReturn !== null);
  type(vim, "$");
  assertEqual(vim.mode, "insert");
  type(vim, "!<Esc>");
  assertEqual(show(vim), "xfoo bar|!");
});

test("insert: gi goes back to where insert stopped", () => {
  assertEqual(run("|foo bar", "Ax<Esc>0giy<Esc>"), "foo barx|y");
});

test("insert: Enter keeps the indent, and an unused indent is dropped", () => {
  assertEqual(run("  - |item", "A<CR><Esc>"), "  - item\n|");
  assertEqual(run("  |foo", "A<CR>bar<Esc>"), "  foo\n  ba|r");
});

test("insert: Tab goes to the next indent stop, Shift-Tab takes one off", () => {
  assertEqual(run("|- item", "i<Tab><Esc>"), " | - item");
  assertEqual(run("|- item", "i<Tab><Tab><Esc>"), "   | - item");
  assertEqual(run("|abc", "a<Tab>x<Esc>"), "a |xbc");
  assertEqual(run("    - |item", "i<S-Tab><Esc>"), "  -| item"); // as Vim's i_CTRL-D
  assertEqual(run("   x|", "a<S-Tab><Esc>"), "  |x");
  assertEqual(run("|x", "i<S-Tab><Esc>"), "|x");
  assertEqual(run("|a", ":set sw=4<CR>i<Tab><Esc>"), "   | a");
});

test("insert: Backspace after Tab removes the whole indent step", () => {
  // Checked against Vim with softtabstop=2.
  assertEqual(run("|x", "i<Tab><Tab><BS><Esc>"), " | x");
  assertEqual(run("    |x", "i<BS><Esc>"), " | x");
  assertEqual(run("a|b", "a  <BS><Esc>"), "ab| ");
  assertEqual(run("ab|c", "a <BS><Esc>"), "ab|c");
});

test("insert: Tab is repeated by . and counted in undo", () => {
  assertEqual(run("|a\nb", "I<Tab><Esc>j0."), "  a\n | b");
  assertEqual(run("|a", "I<Tab><Esc>u"), "|a");
});

test("insert: pasted text goes in as it is, without autoindent", () => {
  const vim = vimAt("  |x");
  type(vim, "i");
  vim.feed({ paste: "a\nb" });
  type(vim, "<Esc>");
  assertEqual(show(vim), "  a\n|bx");
});

test("read-only: changes are refused with a message", () => {
  const vim = vimAt("|foo");
  vim.readOnly = true;
  type(vim, "x");
  assertEqual(vim.text, "foo");
  assertTrue(vim.message.text.startsWith("E21"));
  type(vim, "i");
  assertEqual(vim.mode, "normal");
  type(vim, "yyp");
  assertEqual(vim.text, "foo");
});

test("errors: a failed search reports and leaves the cursor", () => {
  const vim = type(vimAt("foo |bar"), "/nothing<CR>");
  assertEqual(vim.message.text, "E486: Pattern not found: nothing");
  assertEqual(show(vim), "foo |bar");
  assertEqual(vim.mode, "normal");
});

test("errors: a bad regex is reported", () => {
  const vim = type(vimAt("|foo"), "/(<CR>");
  assertTrue(vim.message.text.startsWith("E383"));
});

test("bell: an impossible motion rings, Esc cancels a pending command quietly", () => {
  const vim = vimAt("|foo");
  type(vim, "h");
  assertEqual(vim.bellCount, 1);
  type(vim, "d<Esc>");
  assertEqual(vim.pending.length, 0);
  assertEqual(vim.bellCount, 1);
  type(vim, "<Esc>");
  assertEqual(vim.bellCount, 1);
});

test("search: wrapping around says so", () => {
  const vim = type(vimAt("foo\n|bar"), "/foo<CR>");
  assertEqual(vim.message.text, "search hit BOTTOM, continuing at TOP");
  assertEqual(show(vim), "|foo\nbar");
});

test("search: ignorecase and smartcase", () => {
  assertEqual(run("|x Foo foo", ":set ic<CR>/foo<CR>"), "x |Foo foo");
  assertEqual(run("|x foo Foo", ":set ic scs<CR>/Foo<CR>"), "x foo |Foo");
});

test("search: :noh hides the highlight until the next search", () => {
  const vim = type(vimAt("|foo foo"), "/foo<CR>");
  assertTrue(vim.search.highlight);
  type(vim, ":noh<CR>");
  assertTrue(!vim.search.highlight);
  type(vim, "n");
  assertTrue(vim.search.highlight);
});

test("cmdline: incsearch previews, Esc puts the cursor back", () => {
  const vim = type(vimAt("|foo bar"), "/ba");
  assertEqual(vim.cursor.col, 4);
  assertEqual(vim.incsearch.pos.col, 4);
  type(vim, "<Esc>");
  assertEqual(vim.cursor.col, 0);
  assertEqual(vim.incsearch, null);
  assertEqual(vim.mode, "normal");
});

test("cmdline: backspace on an empty line leaves, history recalls", () => {
  const vim = type(vimAt("|a\nb\nc"), ":<BS>");
  assertEqual(vim.mode, "normal");
  type(vim, ":3<CR>gg:<Up>");
  assertEqual(vim.cmdline.text, "3");
  type(vim, "<CR>");
  assertEqual(vim.cursor.line, 2);
});

test("cmdline: Ctrl-R inserts a register", () => {
  assertEqual(run("|foo bar", 'yiw:s/<C-r>"/X/<CR>'), "|X bar");
});

test("ex: :w and :q send events; :x and ZZ send both", () => {
  const types = (keys) => type(vimAt("|x"), keys).takeEvents().map((event) => event.type + (event.force ? "!" : "")).join(",");
  assertEqual(types(":w<CR>"), "save");
  assertEqual(types(":q<CR>"), "quit");
  assertEqual(types(":q!<CR>"), "quit!");
  assertEqual(types(":wq<CR>"), "save,quit");
  assertEqual(types(":x<CR>"), "save,quit");
  assertEqual(types("ZZ"), "save,quit");
  assertEqual(types("ZQ"), "quit!");
});

test("ex: unknown commands and bad ranges are errors", () => {
  assertTrue(type(vimAt("|x"), ":frobnicate<CR>").message.text.startsWith("E492"));
  assertTrue(type(vimAt("|x"), ":5d<CR>").message.text.startsWith("E16"));
});

test("ex: :set shows and changes options", () => {
  const vim = type(vimAt("|x"), ":set sw=4 noai<CR>");
  assertEqual(vim.options.shiftwidth, 4);
  assertEqual(vim.options.autoindent, false);
  type(vim, ":set sw?<CR>");
  assertEqual(vim.message.text, "shiftwidth=4");
  type(vim, ":set ai!<CR>");
  assertEqual(vim.options.autoindent, true);
  type(vim, ":set nosuch<CR>");
  assertTrue(vim.message.text.startsWith("E518"));
  assertEqual(run("|a", ":set sw=4<CR>>>"), "    |a");
});

test("ex: substitute reports, and :s with an empty pattern reuses the search", () => {
  const vim = type(vimAt("|a\na\na"), ":%s/a/b/<CR>");
  assertEqual(vim.message.text, "3 substitutions on 3 lines");
  assertEqual(run("|foo bar", "/bar<CR>:s//X/<CR>"), "|foo X");
  assertTrue(type(vimAt("|a"), ":s/z/y/<CR>").message.text.startsWith("E486"));
  assertEqual(type(vimAt("|a"), ":s/z/y/e<CR>").message, null);
});

test("marks follow their line when lines above change", () => {
  assertEqual(run("a\nb\n|c", "maggdd'a"), "b\n|c");
  assertEqual(run("a\n|b", "maggOnew<Esc>'a"), "new\na\n|b");
});

test("setText starts over: undo history and marks are cleared", () => {
  const vim = type(vimAt("|foo"), "xma");
  vim.setText("new text");
  type(vim, "u");
  assertEqual(vim.text, "new text");
  assertEqual(vim.marks.get("a"), null);
  assertEqual(vim.cursor.line, 0);
});

test("text with Windows line endings is read as plain lines", () => {
  const vim = new Vim({ text: "a\r\nb\rc" });
  assertEqual(vim.buf.lineCount, 3);
  assertEqual(vim.text, "a\nb\nc");
});
