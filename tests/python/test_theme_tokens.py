"""Colors live only in themes (docs/features/017-theme-tokens.md).

Components name colors by role (`var(--link)`), and only the files in `static/css/themes/` say
what each role looks like. These checks keep it that way, so a new theme is one file:
  1. no palette variable (`--nord8`) or raw color (`#fff`, `rgb(`, `hsl(`) in `static/css`
     outside `themes/`;
  2. no palette variable or hex color in `static/js` (the clipboard HTML in table-copy.js is
     pasted into other programs, which never see our variables, so it keeps its hex);
  3. every theme defines exactly the role tokens `_template.css` lists;
  4. every `var(--name)` is defined somewhere;
  5. every `file:` in the theme table exists.
Each problem names the file and line. The scanners take a `static` folder so they can be
tested on a generated tree as well as run on the real one.
"""
import re
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
STATIC = REPO / "static"

TEMPLATE = "_template.css"
THEMES_TABLE = Path("js") / "theme" / "themes.js"
# Pasted into other programs as clipboard HTML, where our variables mean nothing.
JS_HEX_ALLOWED = {Path("js") / "editor" / "table-copy.js"}

PALETTE = re.compile(r"--nord\d")
# Not after `&` (HTML entities such as `&#039;`), `.` (private fields, `this.#add`) or a word.
HEX = re.compile(r"(?<![\w&.#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])")
COLOR_FUNCTION = re.compile(r"\b(?:rgba?|hsla?)\(", re.IGNORECASE)
DECLARATION = re.compile(r"(--[A-Za-z0-9_-]+)\s*:")
JS_DEFINITION = re.compile(r"setProperty\(\s*[\"'`](--[A-Za-z0-9_-]+)[\"'`]")
VAR_USE = re.compile(r"var\(\s*(--[A-Za-z0-9_-]+)")
TABLE_FILE = re.compile(r"\bfile\s*:\s*[\"'`]([^\"'`]+)[\"'`]")
PALETTE_NAME = re.compile(r"^--nord\d+$")


def strip_css_comments(text: str) -> str:
    """Blank out /* ... */ but keep its newlines, so line numbers still point at the source."""
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def css_text(path: Path) -> str:
    return strip_css_comments(path.read_text(encoding="utf-8"))


def matches_by_line(text: str, pattern: re.Pattern):
    """(line number, matched text) for every match."""
    for match in pattern.finditer(text):
        yield text.count("\n", 0, match.start()) + 1, match.group(0)


def where(static: Path, path: Path, line: int) -> str:
    return f"{path.relative_to(static.parent).as_posix()}:{line}"


def themes_dir(static: Path) -> Path:
    return static / "css" / "themes"


def component_css(static: Path):
    """Every CSS file except the themes."""
    themes = themes_dir(static)
    return sorted(p for p in (static / "css").rglob("*.css") if themes not in p.parents)


def app_js(static: Path):
    return sorted((static / "js").rglob("*.js"))


def raw_colors_in_css(static: Path) -> list:
    problems = []
    for path in component_css(static):
        text = css_text(path)
        for pattern, what in ((PALETTE, "palette variable"), (HEX, "hex color"),
                              (COLOR_FUNCTION, "color function")):
            for line, found in matches_by_line(text, pattern):
                problems.append(f"{where(static, path, line)}: {what} {found!r}; use a role token")
    return problems


def raw_colors_in_js(static: Path) -> list:
    problems = []
    for path in app_js(static):
        text = path.read_text(encoding="utf-8")
        patterns = [(PALETTE, "palette variable")]
        if path.relative_to(static) not in JS_HEX_ALLOWED:
            patterns.append((HEX, "hex color"))
        for pattern, what in patterns:
            for line, found in matches_by_line(text, pattern):
                problems.append(f"{where(static, path, line)}: {what} {found!r}; use a role token")
    return problems


def declared_tokens(path: Path) -> dict:
    """Each custom property a CSS file declares, with the line of its first declaration."""
    tokens = {}
    for line, found in matches_by_line(css_text(path), DECLARATION):
        tokens.setdefault(DECLARATION.match(found).group(1), line)
    return tokens


def role_tokens(path: Path) -> dict:
    """A theme's tokens without its private palette primitives."""
    return {name: line for name, line in declared_tokens(path).items() if not PALETTE_NAME.match(name)}


def theme_files(static: Path):
    return sorted(p for p in themes_dir(static).glob("*.css") if p.name != TEMPLATE)


def theme_mismatches(static: Path) -> list:
    template_path = themes_dir(static) / TEMPLATE
    if not template_path.is_file():
        return [f"{where(static, template_path, 1)}: the theme template is missing"]
    template = role_tokens(template_path)
    if not template:
        return [f"{where(static, template_path, 1)}: the template lists no tokens"]
    problems = []
    themes = theme_files(static)
    if not themes:
        problems.append(f"{where(static, themes_dir(static), 1)}: no theme besides the template")
    for path in themes:
        tokens = role_tokens(path)
        for name, line in tokens.items():
            if name not in template:
                problems.append(f"{where(static, path, line)}: {name} is not in {TEMPLATE}")
        for name, line in template.items():
            if name not in tokens:
                problems.append(f"{where(static, path, 1)}: lacks {name} "
                                f"({where(static, template_path, line)})")
    return problems


def defined_variables(static: Path) -> set:
    """Declared in any CSS file (tokens.css and the template included), or set inline from JS."""
    names = set()
    for path in (static / "css").rglob("*.css"):
        names |= set(declared_tokens(path))
    for path in app_js(static):
        names |= set(JS_DEFINITION.findall(path.read_text(encoding="utf-8")))
    return names


def undefined_variables(static: Path) -> list:
    defined = defined_variables(static)
    problems = []
    sources = [(p, css_text(p)) for p in sorted((static / "css").rglob("*.css"))]
    sources += [(p, p.read_text(encoding="utf-8")) for p in app_js(static)]
    for path, text in sources:
        for match in VAR_USE.finditer(text):
            name = match.group(1)
            if name not in defined:
                line = text.count("\n", 0, match.start()) + 1
                problems.append(f"{where(static, path, line)}: var({name}) is defined nowhere")
    return problems


def missing_theme_files(static: Path) -> list:
    table = static / THEMES_TABLE
    if not table.is_file():
        return [f"{where(static, table, 1)}: the theme table is missing"]
    text = table.read_text(encoding="utf-8")
    entries = list(TABLE_FILE.finditer(text))
    if not entries:
        return [f"{where(static, table, 1)}: the theme table names no file"]
    problems = []
    for match in entries:
        if not (static / match.group(1)).is_file():
            line = text.count("\n", 0, match.start()) + 1
            problems.append(f"{where(static, table, line)}: {match.group(1)} does not exist")
    return problems


def report(problems: list) -> str:
    return "\n" + "\n".join(problems)


class RealTreeTest(unittest.TestCase):
    """The checks on the app's own static folder."""

    def test_no_raw_colors_in_component_css(self) -> None:
        problems = raw_colors_in_css(STATIC)
        self.assertEqual(problems, [], report(problems))

    def test_no_raw_colors_in_js(self) -> None:
        problems = raw_colors_in_js(STATIC)
        self.assertEqual(problems, [], report(problems))

    def test_every_theme_has_exactly_the_template_tokens(self) -> None:
        problems = theme_mismatches(STATIC)
        self.assertEqual(problems, [], report(problems))

    def test_every_variable_used_is_defined(self) -> None:
        problems = undefined_variables(STATIC)
        self.assertEqual(problems, [], report(problems))

    def test_theme_table_files_exist(self) -> None:
        problems = missing_theme_files(STATIC)
        self.assertEqual(problems, [], report(problems))


class SampleTree:
    """A generated static folder holding one clean theme setup, for the checks' own tests."""

    def __init__(self, root: Path) -> None:
        self.static = root / "static"
        self.write("css/tokens.css", ":root {\n  --sp-1: 4px;\n}\n")
        self.write("css/themes/_template.css",
                   ":root[data-theme=\"x\"] {\n"
                   "  /* the page behind everything */\n  --surface-page: ;\n"
                   "  /* links */\n  --link: ;\n}\n")
        self.write("css/themes/nord-dark.css",
                   ":root[data-theme=\"nord-dark\"] {\n  --nord0: #2e3440;\n  --nord8: #88c0d0;\n"
                   "  --surface-page: var(--nord0);\n  --link: rgb(136 192 208);\n}\n")
        self.write("css/hub.css", "/* was #fff and --nord8 */\n.hub {\n  color: var(--link);\n"
                   "  background: color-mix(in srgb, var(--surface-page) 50%, transparent);\n"
                   "  width: calc(var(--width) * 100%);\n}\n#app { padding: var(--sp-1); }\n")
        self.write("js/theme/themes.js",
                   "export const THEMES = [\n  { id: \"nord-dark\", file: \"css/themes/nord-dark.css\" },\n];\n")
        self.write("js/hubs/bar.js",
                   "node.style.setProperty(\"--width\", \"1\");\nlocation.hash = \"#tags\";\n"
                   "this.#bad = 1;\nconst quote = \"&#039;\";\n")
        self.write("js/editor/table-copy.js", "const CELL = \"border:1px solid #808080\";\n")

    def write(self, name: str, text: str) -> Path:
        path = self.static / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        return path

    def append(self, name: str, text: str) -> None:
        path = self.static / name
        path.write_text(path.read_text(encoding="utf-8") + text, encoding="utf-8", newline="\n")


class ChecksTest(unittest.TestCase):
    """The checks themselves, on a generated tree: clean passes, each kind of slip is caught."""

    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.tree = SampleTree(Path(folder.name))
        self.static = self.tree.static

    def all_problems(self) -> list:
        return (raw_colors_in_css(self.static) + raw_colors_in_js(self.static)
                + theme_mismatches(self.static) + undefined_variables(self.static)
                + missing_theme_files(self.static))

    def test_clean_tree_passes(self) -> None:
        problems = self.all_problems()
        self.assertEqual(problems, [], report(problems))

    def test_hex_in_component_css_names_the_line(self) -> None:
        self.tree.append("css/hub.css", ".x {\n  color: #fff;\n}\n")
        self.assertEqual(raw_colors_in_css(self.static),
                         ["static/css/hub.css:9: hex color '#fff'; use a role token"])

    def test_palette_variable_in_component_css_names_the_line(self) -> None:
        self.tree.write("css/today.css", ".today {\n  color: var(--nord8);\n}\n")
        self.assertEqual(raw_colors_in_css(self.static),
                         ["static/css/today.css:2: palette variable '--nord8'; use a role token"])

    def test_long_hex_and_color_functions_are_caught(self) -> None:
        self.tree.write("css/ui.css", "a { color: #88c0d0; }\nb { color: #88c0d0cc; }\n"
                        "c { box-shadow: 0 0 4px rgb(0 0 0 / 40%); }\nd { color: rgba(0,0,0,.5); }\n"
                        "e { color: hsl(0 0% 0%); }\nf { color: HSLA(0, 0%, 0%, 1); }\n")
        lines = [problem.split(":")[1] for problem in raw_colors_in_css(self.static)]
        self.assertEqual(lines, ["1", "2", "3", "4", "5", "6"])

    def test_raw_colors_inside_themes_are_allowed(self) -> None:
        self.assertEqual(raw_colors_in_css(self.static), [])

    def test_palette_variable_in_js_is_caught(self) -> None:
        self.tree.write("js/diagrams/mermaid.js", "const a = 1;\ncolour(\"--nord0\");\n")
        self.assertEqual(raw_colors_in_js(self.static),
                         ["static/js/diagrams/mermaid.js:2: palette variable '--nord0'; use a role token"])

    def test_hex_in_js_is_caught_except_table_copy(self) -> None:
        self.tree.write("js/ui/paint.js", "node.style.color = \"#a3be8c\";\n")
        self.assertEqual(raw_colors_in_js(self.static),
                         ["static/js/ui/paint.js:1: hex color '#a3be8c'; use a role token"])

    def test_palette_variable_in_table_copy_is_still_caught(self) -> None:
        self.tree.append("js/editor/table-copy.js", "x(\"--nord3\");\n")
        self.assertEqual(len(raw_colors_in_js(self.static)), 1)

    def test_theme_lacking_a_template_token_is_caught(self) -> None:
        self.tree.write("css/themes/nord-light.css",
                        ":root[data-theme=\"nord-light\"] {\n  --surface-page: white;\n}\n")
        self.assertEqual(theme_mismatches(self.static), [
            "static/css/themes/nord-light.css:1: lacks --link (static/css/themes/_template.css:5)"])

    def test_theme_with_a_token_the_template_lacks_is_caught(self) -> None:
        self.tree.write("css/themes/nord-light.css",
                        ":root[data-theme=\"nord-light\"] {\n  --surface-page: white;\n"
                        "  --link: blue;\n  --glow: red;\n}\n")
        self.assertEqual(theme_mismatches(self.static),
                         ["static/css/themes/nord-light.css:4: --glow is not in _template.css"])

    def test_missing_template_is_caught(self) -> None:
        (self.static / "css" / "themes" / TEMPLATE).unlink()
        self.assertEqual(len(theme_mismatches(self.static)), 1)

    def test_undefined_variable_in_css_is_caught(self) -> None:
        self.tree.append("css/hub.css", ".y { color: var(--text-ghost); }\n")
        self.assertEqual(undefined_variables(self.static),
                         ["static/css/hub.css:8: var(--text-ghost) is defined nowhere"])

    def test_undefined_variable_in_js_is_caught(self) -> None:
        self.tree.write("js/ui/paint.js", "\nnode.style.color = \"var(--nope)\";\n")
        self.assertEqual(undefined_variables(self.static),
                         ["static/js/ui/paint.js:2: var(--nope) is defined nowhere"])

    def test_theme_table_naming_a_missing_file_is_caught(self) -> None:
        self.tree.write("js/theme/themes.js",
                        "export const THEMES = [\n  { id: \"a\", file: \"css/themes/nord-dark.css\" },\n"
                        "  { id: \"b\", file: \"css/themes/gone.css\" },\n];\n")
        self.assertEqual(missing_theme_files(self.static),
                         ["static/js/theme/themes.js:3: css/themes/gone.css does not exist"])

    def test_missing_theme_table_is_caught(self) -> None:
        (self.static / THEMES_TABLE).unlink()
        self.assertEqual(len(missing_theme_files(self.static)), 1)


if __name__ == "__main__":
    unittest.main()
