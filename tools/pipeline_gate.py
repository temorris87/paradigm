"""Every automatic check a change must pass before it is committed.

Used by the Claude Code hooks, tools/githooks/pre-commit, the feature workflow's gate phase and
CI. Standard library only; runs on Windows, macOS and Linux (Python 3.10 or newer to run it; the
Python tests run under 3.11 when it is installed).

  python tools/pipeline_gate.py            # everything
  python tools/pipeline_gate.py --no-js    # without the browser tests (CI runs them apart)
  python tools/pipeline_gate.py --reuse    # pass at once if this exact tree already passed
  python tools/pipeline_gate.py --ledger   # also: the feature in progress went through every phase

While a feature is in progress (.pipeline/current) the result is recorded as its gate phase.
"""
import argparse
import ast
import json
import pathlib
import re
import shutil
import subprocess
import sys

import pipeline_state

REPO = pipeline_state.REPO
CACHE = pipeline_state.STATE_DIR / "last-gate.json"
MIGRATIONS = REPO / "paradigm" / "db" / "migrations"
JS_TESTS = REPO / "tests" / "js"


def python_files():
    files = [REPO / "paradigm.py", REPO / "paradigm.pyw"]
    for top in ("paradigm", "tests", "tools"):
        files += [p for p in (REPO / top).rglob("*.py") if "__pycache__" not in p.parts]
    return sorted(p for p in files if p.is_file())


def rel(path):
    return path.relative_to(REPO).as_posix()


def check_syntax():
    problems = []
    files = python_files()
    for path in files:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=rel(path), feature_version=(3, 11))
        except SyntaxError as error:
            problems.append(f"{rel(path)}:{error.lineno}: not Python 3.11: {error.msg}")
    return f"{len(files)} files parse as Python 3.11", problems


def _local_names(path):
    """Modules a file may import that are ours: its neighbours, the repo root, tests and tools."""
    names = set()
    for folder in {path.parent, REPO, REPO / "tests" / "python", REPO / "tools"}:
        for child in folder.iterdir():
            if child.suffix in (".py", ".pyw"):
                names.add(child.stem)
            elif child.is_dir() and (child / "__init__.py").exists():
                names.add(child.name)
    names.add("paradigm")
    return names


def check_imports():
    problems = []
    for path in python_files():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel(path))
        local = _local_names(path)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            else:
                continue
            for name in names:
                top = name.split(".")[0]
                if top not in sys.stdlib_module_names and top not in local:
                    problems.append(f"{rel(path)}:{node.lineno}: imports {name!r}: not the standard library")
    return "imports are the standard library or our own", problems


# A URL with a scheme or protocol-relative, right where the page would load it.
REMOTE_LOAD = re.compile(
    r"""(?:\b(?:src|href|action)\s*=\s*|\bfrom\s+|\bimport\s*\(?\s*|@import\s+(?:url\()?|url\(\s*|"""
    r"""\bfetch\(\s*|\bnew\s+(?:Worker|EventSource|WebSocket)\(\s*)["'`]?\s*(?:[a-z][a-z0-9+.-]*:)?//""",
    re.IGNORECASE,
)


def check_remote_urls():
    problems = []
    static = REPO / "static"
    for path in sorted(static.rglob("*")):
        if path.suffix not in (".html", ".js", ".css") or "vendor" in path.relative_to(static).parts:
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if REMOTE_LOAD.search(line):
                problems.append(f"{rel(path)}:{number}: loads from outside: {line.strip()[:100]}")
    return "static/ loads nothing from outside (vendor/ aside)", problems


def check_js_test_imports():
    runner = (JS_TESTS / "index.html").read_text(encoding="utf-8")
    imported = set(re.findall(r"""["']\./(test_[^"']+\.js)["']""", runner))
    files = {p.name for p in JS_TESTS.glob("test_*.js")}
    problems = [f"tests/js/{name} is not imported in tests/js/index.html" for name in sorted(files - imported)]
    problems += [f"tests/js/index.html imports {name}, which does not exist" for name in sorted(imported - files)]
    return f"all {len(files)} JS test files are imported", problems


def check_migrations():
    problems, numbers = [], []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        match = re.fullmatch(r"(\d{3})_[a-z0-9_]+\.sql", path.name)
        if not match:
            problems.append(f"{rel(path)}: not named NNN_name.sql")
            continue
        numbers.append(int(match.group(1)))
    for number in sorted({n for n in numbers if numbers.count(n) > 1}):
        problems.append(f"migration {number:03d} is used twice")
    expected = list(range(1, len(numbers) + 1))
    if sorted(numbers) != expected and not problems:
        problems.append(f"migrations are not numbered 001..{len(numbers):03d} without gaps")
    return f"{len(numbers)} migrations numbered in order", problems


def python_311():
    """The interpreter for the tests: 3.11 (the work PC's) when it can be found."""
    if sys.version_info[:2] == (3, 11):
        return [sys.executable], None
    found = shutil.which("python3.11")
    if found:
        return [found], None
    if shutil.which("py"):
        probe = subprocess.run(["py", "-3.11", "-c", "pass"], capture_output=True)
        if probe.returncode == 0:
            return ["py", "-3.11"], None
    version = ".".join(map(str, sys.version_info[:3]))
    return [sys.executable], f"Python 3.11 not found; the tests ran under {version}"


def _tail(text, lines=60):
    return text.strip().splitlines()[-lines:]


def check_python_tests():
    python, warning = python_311()
    result = subprocess.run(python + ["-m", "unittest", "discover", "tests/python"], cwd=REPO,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    output = result.stderr + result.stdout
    summary = next((l for l in reversed(output.splitlines()) if l.startswith("Ran ")), "Python tests")
    problems = [] if result.returncode == 0 else _tail(output)
    label = summary + (f" (warning: {warning})" if warning else "")
    return label, problems


def check_js_tests():
    result = subprocess.run([sys.executable, str(REPO / "tools" / "run_js_tests.py")], cwd=REPO,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    lines = result.stdout.strip().splitlines()
    summary = lines[-1] if lines else "JS tests: no output"
    if result.returncode == 0:
        return summary, []
    return summary, lines[:-1][-40:] or ["(the line above says why)"]


def check_ledger():
    slug = pipeline_state.current_slug()
    if not slug:
        return "no feature in progress", []
    return f"feature {slug} went through every phase", pipeline_state.problems(slug)


def run_checks(no_js):
    checks = [check_syntax, check_imports, check_remote_urls, check_js_test_imports, check_migrations,
              check_python_tests]
    if not no_js:
        checks.append(check_js_tests)
    failed = False
    for check in checks:
        label, problems = check()
        print(f"{'FAIL' if problems else 'ok  '} {label}")
        for problem in problems:
            print(f"       {problem}")
        failed = failed or bool(problems)
    return not failed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-js", action="store_true", help="skip the browser tests")
    parser.add_argument("--reuse", action="store_true", help="pass at once if this tree already passed")
    parser.add_argument("--ledger", action="store_true", help="also check the feature in progress")
    args = parser.parse_args(argv)
    # A Windows console may not hold every character a test or a code line prints.
    sys.stdout.reconfigure(errors="replace")
    if sys.version_info < (3, 10):
        print("GATE FAIL: run it with Python 3.10 or newer (it needs sys.stdlib_module_names)")
        return 1

    tree = pipeline_state.fingerprint()
    cached = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.is_file() else {}
    if args.reuse and cached.get("fingerprint") == tree and cached.get("passed") and (args.no_js or cached.get("js")):
        print(f"ok   this tree passed the gate at {cached['at']}")
        passed = True
        slug = pipeline_state.current_slug()
        if slug and cached.get("js"):
            gate = pipeline_state.load(slug)["phases"].get("gate", {})
            if gate.get("fingerprint") != tree or gate.get("status") != "pass":
                pipeline_state.record(slug, "gate", "pass", f"same tree as the run at {cached['at']}")
    else:
        passed = run_checks(args.no_js)
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps({"fingerprint": tree, "passed": passed, "js": not args.no_js,
                                     "at": pipeline_state.now()}) + "\n", encoding="utf-8")
        slug = pipeline_state.current_slug()
        if slug and not args.no_js:
            pipeline_state.record(slug, "gate", "pass" if passed else "fail")

    if args.ledger:
        label, problems = check_ledger()
        print(f"{'FAIL' if problems else 'ok  '} {label}")
        for problem in problems:
            print(f"       {problem}")
        passed = passed and not problems
    print("GATE PASS" if passed else "GATE FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
