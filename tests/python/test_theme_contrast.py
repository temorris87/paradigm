"""Text in a theme is readable (docs/features/018-nord-light.md).

The check parses a theme file by its id, resolves each token (`var(--x)` within the file) to a
color, and computes WCAG 2 contrast ratios for the pairs the app draws: text on surfaces, each
state and kind foreground on its tint, text on the accent and on the solids that carry text,
and the focus edge on the page. Every shortfall names the pair and its ratio. A token that
does not resolve to a color fails too, since the ratios would mean nothing.

Only nord-light is held to these bars: nord-dark keeps its old look (and its `color-mix()`
values, which this parser does not read).
"""
import re
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
STATIC = REPO / "static"

TEXT_BAR = 4.5
EDGE_BAR = 3.0

TEXT_TOKENS = ("--text-strong", "--text", "--text-dim", "--text-faint", "--text-muted",
               "--text-heading", "--text-code", "--text-control", "--text-label", "--text-math",
               "--link", "--link-secondary")
TEXT_SURFACES = ("--surface-page", "--surface-raised", "--surface-sunken", "--surface-selected",
                 "--surface-hover", "--surface-input")
TONE_SURFACES = ("--surface-page", "--surface-raised", "--surface-sunken")
TONES = ("--state-danger", "--state-warning", "--state-caution", "--state-success",
         "--state-info", "--kind-task", "--kind-decision", "--kind-question", "--kind-meeting")
FOCUS_TOKENS = ("--border-focus", "--focus-ring")
FOCUS_SURFACES = ("--surface-page", "--surface-raised")
# The fills `--text-on-solid` is drawn on, found by grepping its uses in static/css: the tree's
# Inbox pill, <mark> and the current search match. The capture and card badges became tinted
# chips (spec 019), so the kind solids only colour a chip's dot and carry no text. The success
# and info solids carry no text either. StylesheetDriftTest keeps this list equal to what the
# stylesheets draw.
TEXT_SOLIDS = ("--state-caution-solid", "--mark-bg", "--search-current")

DECLARATION = re.compile(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;]*);")
VAR_ONLY = re.compile(r"^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$")
HEX = re.compile(r"^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
RGB = re.compile(r"^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?)\s*)?\)$",
                 re.IGNORECASE)


def theme_path(static: Path, theme_id: str) -> Path:
    return static / "css" / "themes" / f"{theme_id}.css"


def declarations(text: str) -> dict:
    """Each custom property the file declares and its raw value (the first one wins)."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    values = {}
    for name, value in DECLARATION.findall(text):
        values.setdefault(name, value.strip())
    return values


def parse_color(value: str):
    """(r, g, b, alpha) with r, g, b in 0-255 and alpha in 0-1, or None if not a plain color."""
    value = value.strip()
    match = HEX.match(value)
    if match:
        digits = match.group(1)
        if len(digits) in (3, 4):
            digits = "".join(c * 2 for c in digits)
        channels = [int(digits[i:i + 2], 16) for i in range(0, len(digits), 2)]
        alpha = channels[3] / 255 if len(channels) == 4 else 1.0
        return (channels[0], channels[1], channels[2], alpha)
    match = RGB.match(value)
    if match:
        r, g, b = (int(match.group(i)) for i in (1, 2, 3))
        if max(r, g, b) > 255:
            return None
        alpha = 1.0
        if match.group(4) is not None:
            alpha = float(match.group(4)) / (100 if match.group(5) else 1)
        return (r, g, b, alpha)
    return None


def resolve(values: dict):
    """({token: color}, [problems]): follow `var()` chains within the file down to a color."""
    colors, problems = {}, []
    for name in values:
        seen, current = [name], values[name]
        while True:
            ref = VAR_ONLY.match(current)
            if not ref:
                break
            target = ref.group(1)
            if target in seen or target not in values:
                current = None
                break
            seen.append(target)
            current = values[target]
        color = parse_color(current) if current is not None else None
        if color is None:
            problems.append(f"{name}: {values[name]!r} does not resolve to a color")
        else:
            colors[name] = color
    return colors, problems


def luminance(color) -> float:
    """WCAG 2 relative luminance of an opaque sRGB color."""
    def linear(channel: float) -> float:
        c = channel / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = color[:3]
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)


def over(fg, bg):
    """A translucent foreground composited onto its (opaque) background."""
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def contrast(fg, bg) -> float:
    lighter, darker = sorted((luminance(over(fg, bg)), luminance(bg)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def required_pairs():
    """(foreground, background, bar) for every pair the theme must keep readable."""
    pairs = [(text, surface, TEXT_BAR) for text in TEXT_TOKENS for surface in TEXT_SURFACES]
    for tone in TONES:
        for surface in TONE_SURFACES + (f"{tone}-bg",):
            pairs.append((f"{tone}-fg", surface, TEXT_BAR))
    pairs.append(("--text-on-accent", "--accent", TEXT_BAR))
    pairs += [(edge, surface, EDGE_BAR) for edge in FOCUS_TOKENS for surface in FOCUS_SURFACES]
    pairs += [("--text-on-solid", solid, TEXT_BAR) for solid in TEXT_SOLIDS]
    return pairs


def shortfalls(colors: dict, pairs) -> list:
    problems = []
    for fg, bg, bar in pairs:
        missing = [name for name in (fg, bg) if name not in colors]
        if missing:
            problems.append(f"{fg} on {bg}: {', '.join(missing)} has no color")
            continue
        ratio = contrast(colors[fg], colors[bg])
        if ratio < bar:
            problems.append(f"{fg} on {bg}: {ratio:.2f}:1, under {bar}:1")
    return problems


def theme_problems(static: Path, theme_id: str) -> list:
    path = theme_path(static, theme_id)
    if not path.is_file():
        return [f"{path.relative_to(static.parent).as_posix()}: the theme file is missing"]
    colors, problems = resolve(declarations(path.read_text(encoding="utf-8")))
    return problems + shortfalls(colors, required_pairs())


def report(problems: list) -> str:
    return "\n" + "\n".join(problems)


class RealThemeTest(unittest.TestCase):
    def test_nord_light_is_readable(self) -> None:
        problems = theme_problems(STATIC, "nord-light")
        self.assertEqual(problems, [], report(problems))


# A theme that passes every bar: dark text on light surfaces, deep tones on pale tints.
GOOD_THEME = {
    "--white": "#ffffff",
    "--surface-page": "#eceff4", "--surface-raised": "#f8f9fb", "--surface-sunken": "#e5e9f0",
    "--surface-selected": "#e2e8f0", "--surface-hover": "#dde2ec",
    "--surface-input": "var(--white)",
    "--text-on-accent": "var(--white)", "--accent": "#3b5f8a",
    "--border-focus": "#486b96", "--focus-ring": "#5179a9",
    "--text-on-solid": "#242933",
    "--shadow": "rgb(46 52 64 / 0.12)",
}
GOOD_THEME.update({token: "#2e3440" for token in TEXT_TOKENS})
GOOD_THEME.update({f"{tone}-fg": "#3a3f4a" for tone in TONES})
GOOD_THEME.update({f"{tone}-bg": "#f4f5f7" for tone in TONES})
GOOD_THEME.update({solid: "#ebcb8b" for solid in TEXT_SOLIDS})


def theme_css(values: dict) -> str:
    lines = "".join(f"  {name}: {value}; /* a role */\n" for name, value in values.items())
    return f":root[data-theme=\"sample\"] {{\n  color-scheme: light;\n{lines}}}\n"


class ContrastMathTest(unittest.TestCase):
    def test_black_on_white_is_21(self) -> None:
        self.assertAlmostEqual(contrast((0, 0, 0, 1.0), (255, 255, 255, 1.0)), 21.0)

    def test_order_does_not_matter(self) -> None:
        a, b = parse_color("#2e3440"), parse_color("#eceff4")
        self.assertAlmostEqual(contrast(a, b), contrast(b, a))

    def test_known_ratio(self) -> None:
        # #767676 on white is the classic 4.54:1 grey.
        self.assertAlmostEqual(contrast(parse_color("#767676"), parse_color("#fff")), 4.54, 2)

    def test_translucent_foreground_is_composited(self) -> None:
        half_black = parse_color("rgb(0 0 0 / 0.5)")
        self.assertLess(contrast(half_black, (255, 255, 255, 1.0)), 21.0 / 2)


class ParseTest(unittest.TestCase):
    def test_hex_forms(self) -> None:
        self.assertEqual(parse_color("#fff"), (255, 255, 255, 1.0))
        self.assertEqual(parse_color("#2E3440"), (46, 52, 64, 1.0))
        self.assertEqual(parse_color("#00000080")[3], 128 / 255)

    def test_rgb_forms(self) -> None:
        self.assertEqual(parse_color("rgb(46 52 64 / 0.35)"), (46, 52, 64, 0.35))
        self.assertEqual(parse_color("rgba(46, 52, 64, 0.2)"), (46, 52, 64, 0.2))
        self.assertEqual(parse_color("rgb(46 52 64 / 20%)"), (46, 52, 64, 0.2))
        self.assertEqual(parse_color("rgb(1 2 3)"), (1, 2, 3, 1.0))

    def test_non_colors(self) -> None:
        for value in ("color-mix(in srgb, #fff 50%, #000)", "white", "#ggg", "rgb(300 0 0)", ""):
            self.assertIsNone(parse_color(value), value)

    def test_declarations_skip_comments_and_non_tokens(self) -> None:
        values = declarations("/* --old: #000; */\n:root {\n  color-scheme: light;\n"
                              "  --a: #fff;\n  --a: #000;\n  --b: var( --a );\n}\n")
        self.assertEqual(values, {"--a": "#fff", "--b": "var( --a )"})

    def test_var_chains_resolve(self) -> None:
        colors, problems = resolve({"--nord0": "#2e3440", "--text": "var(--nord0)",
                                    "--text-strong": "var(--text)"})
        self.assertEqual(problems, [])
        self.assertEqual(colors["--text-strong"], (46, 52, 64, 1.0))

    def test_unresolvable_tokens_are_named(self) -> None:
        colors, problems = resolve({"--a": "var(--gone)", "--b": "var(--c)", "--c": "var(--b)",
                                    "--d": "color-mix(in srgb, #fff 50%, #000)"})
        self.assertEqual(colors, {})
        self.assertEqual([p.split(":")[0] for p in problems], ["--a", "--b", "--c", "--d"])


class ThemeCheckTest(unittest.TestCase):
    """The whole check on generated theme files."""

    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.static = Path(folder.name) / "static"
        theme_path(self.static, "sample").parent.mkdir(parents=True)

    def check(self, values: dict) -> list:
        theme_path(self.static, "sample").write_text(theme_css(values), encoding="utf-8",
                                                     newline="\n")
        return theme_problems(self.static, "sample")

    def test_good_theme_passes(self) -> None:
        problems = self.check(GOOD_THEME)
        self.assertEqual(problems, [], report(problems))

    def test_faint_text_names_the_pair_and_ratio(self) -> None:
        problems = self.check({**GOOD_THEME, "--text-faint": "#aeb5c3"})
        self.assertIn("--text-faint on --surface-page: ", problems[0])
        self.assertIn(":1, under 4.5:1", problems[0])
        self.assertTrue(all(p.startswith("--text-faint on ") for p in problems))
        self.assertEqual(len(problems), len(TEXT_SURFACES))

    def test_tone_on_its_own_tint_is_checked(self) -> None:
        problems = self.check({**GOOD_THEME, "--kind-question-bg": "#3a3f4a"})
        self.assertEqual([p.split(":")[0] for p in problems],
                         ["--kind-question-fg on --kind-question-bg"])

    def test_text_on_accent_is_checked(self) -> None:
        problems = self.check({**GOOD_THEME, "--accent": "#88c0d0"})
        self.assertEqual([p.split(":")[0] for p in problems], ["--text-on-accent on --accent"])

    def test_focus_is_held_to_three(self) -> None:
        # About 3.4:1 on page: short of text's 4.5 but over the edge bar.
        self.assertEqual(self.check({**GOOD_THEME, "--focus-ring": "#6d86a8"}), [])
        problems = self.check({**GOOD_THEME, "--focus-ring": "#aeb5c3"})
        self.assertEqual([p.split(":")[0] for p in problems],
                         ["--focus-ring on --surface-page", "--focus-ring on --surface-raised"])

    def test_text_on_a_dark_solid_is_caught(self) -> None:
        problems = self.check({**GOOD_THEME, "--state-caution-solid": "#6c4f6a"})
        self.assertEqual([p.split(":")[0] for p in problems],
                         ["--text-on-solid on --state-caution-solid"])

    def test_text_on_a_dark_mark_is_caught(self) -> None:
        problems = self.check({**GOOD_THEME, "--mark-bg": "#4c566a", "--search-current": "#3b4252"})
        self.assertEqual([p.split(":")[0] for p in problems],
                         ["--text-on-solid on --mark-bg", "--text-on-solid on --search-current"])

    def test_unresolvable_token_fails(self) -> None:
        problems = self.check({**GOOD_THEME, "--shadow": "color-mix(in srgb, #000 30%, #fff)"})
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("--shadow: "))

    def test_missing_pair_token_fails(self) -> None:
        values = dict(GOOD_THEME)
        del values["--surface-input"]
        problems = self.check(values)
        self.assertTrue(problems)
        self.assertTrue(all("--surface-input has no color" in p for p in problems))

    def test_missing_theme_file_fails(self) -> None:
        self.assertEqual(theme_problems(self.static, "absent"),
                         ["static/css/themes/absent.css: the theme file is missing"])


RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
ON_SOLID_COLOR = re.compile(r"(?:^|[;\s])color\s*:\s*var\(\s*--text-on-solid\s*\)")
BACKGROUND_VAR = re.compile(r"background(?:-color)?\s*:\s*var\(\s*(--[A-Za-z0-9_-]+)\s*\)")


def rules(css: str):
    """(selectors, body) for each rule, comments removed; rules inside @media count too."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for selector_text, body in RULE.findall(css):
        yield [s.strip() for s in selector_text.split(",") if s.strip()], body


def on_solid_fills(sheets) -> set:
    """The background tokens under `--text-on-solid` text: in the same rule, or in a BEM
    modifier of its block (`.badge` sets the text color, `.badge--question` the fill)."""
    all_rules = [rule for css in sheets for rule in rules(css)]
    fills, blocks = set(), set()
    for selectors, body in all_rules:
        if ON_SOLID_COLOR.search(body):
            fills.update(BACKGROUND_VAR.findall(body))
            blocks.update(selector.split("--")[0] for selector in selectors)
    for selectors, body in all_rules:
        if any(selector.startswith(f"{block}--") for selector in selectors for block in blocks):
            fills.update(BACKGROUND_VAR.findall(body))
    return fills


def app_stylesheets(static: Path) -> list:
    """The app's stylesheets, not the themes (which only declare tokens)."""
    themes = static / "css" / "themes"
    return [path.read_text(encoding="utf-8") for path in sorted((static / "css").rglob("*.css"))
            if themes not in path.parents]


class StylesheetDriftTest(unittest.TestCase):
    def test_text_solids_match_the_stylesheets(self) -> None:
        self.assertEqual(sorted(on_solid_fills(app_stylesheets(STATIC))), sorted(TEXT_SOLIDS),
                         "TEXT_SOLIDS must list exactly the fills --text-on-solid is drawn on")

    def test_fills_are_found_in_the_rule_and_its_modifiers(self) -> None:
        css = (".pill { background: var(--a-solid); color: var(--text-on-solid); }\n"
               "/* .x { color: var(--text-on-solid); background: var(--commented); } */\n"
               ".badge,\n.chip { color: var(--text-on-solid); }\n"
               ".badge--q { background: var(--q-solid); }\n"
               "@media print { .chip--t { background-color: var(--t-solid); } }\n"
               ".badgeish { background: var(--not-a-modifier); }\n"
               ".bar { background: var(--bar-solid); color: var(--text); }\n")
        self.assertEqual(on_solid_fills([css]), {"--a-solid", "--q-solid", "--t-solid"})


if __name__ == "__main__":
    unittest.main()
