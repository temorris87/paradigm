"""Run the JS tests (tests/js/) in a browser and print the harness's outcome.

Serves the repo on a free 127.0.0.1 port, opens tests/js/?report in a fresh browser profile and
waits for the page to POST its summary to /__report. Exit 0 on PASS, 1 on FAIL, 2 when no
browser could run them.

  python tools/run_js_tests.py [--browser auto|firefox|chrome|edge|safari] [--timeout 120]

auto tries Firefox, Chrome/Chromium, then Edge, all headless. Safari (Mac only, a background tab
closed afterwards) runs only when asked for: a background tab never gets the keyboard focus, so
the focus and key tests fail there and its result is not a pass or fail of the suite.
"""
import argparse
import http.server
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile
import threading
import time

REPO = pathlib.Path(__file__).resolve().parent.parent

# Explicit types: on Windows the registry can turn .js into text/plain (see paradigm/CLAUDE.md).
TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO), **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/__report":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        self.server.report = json.loads(body.decode("utf-8"))
        self.send_response(204)
        self.end_headers()
        self.server.done.set()


def _mac_app(name, binary):
    for root in (pathlib.Path("/Applications"), pathlib.Path.home() / "Applications"):
        path = root / f"{name}.app" / "Contents" / "MacOS" / binary
        if path.exists():
            yield str(path)


def _windows_exe(*parts):
    for env in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        root = os.environ.get(env)
        if root:
            path = pathlib.Path(root, *parts)
            if path.exists():
                yield str(path)


def _on_path(*names):
    for name in names:
        found = shutil.which(name)
        if found:
            yield found


def find_browsers():
    """(kind, executable) pairs, best first."""
    system = platform.system()
    found = []
    if system == "Darwin":
        found += [("firefox", p) for p in _mac_app("Firefox", "firefox")]
        found += [("chrome", p) for p in _mac_app("Google Chrome", "Google Chrome")]
        found += [("chrome", p) for p in _mac_app("Chromium", "Chromium")]
        found += [("edge", p) for p in _mac_app("Microsoft Edge", "Microsoft Edge")]
    elif system == "Windows":
        found += [("firefox", p) for p in _windows_exe("Mozilla Firefox", "firefox.exe")]
        found += [("chrome", p) for p in _windows_exe("Google", "Chrome", "Application", "chrome.exe")]
        found += [("edge", p) for p in _windows_exe("Microsoft", "Edge", "Application", "msedge.exe")]
    found += [("firefox", p) for p in _on_path("firefox")]
    found += [("chrome", p) for p in _on_path("google-chrome", "google-chrome-stable", "chromium",
                                             "chromium-browser", "chrome")]
    found += [("edge", p) for p in _on_path("microsoft-edge", "msedge")]
    if system == "Darwin" and pathlib.Path("/Applications/Safari.app").exists():
        found.append(("safari", "open"))
    return found


def launch(kind, exe, url, profile):
    """Start the browser on url; returns a Popen, or None for Safari (driven through open)."""
    quiet = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if kind == "firefox":
        prefs = [
            'user_pref("browser.shell.checkDefaultBrowser", false);',
            'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
            'user_pref("browser.aboutwelcome.enabled", false);',
            'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
        ]
        pathlib.Path(profile, "user.js").write_text("\n".join(prefs) + "\n", encoding="utf-8")
        return subprocess.Popen([exe, "--headless", "-no-remote", "-profile", profile, url], **quiet)
    if kind in ("chrome", "edge"):
        return subprocess.Popen([exe, "--headless=new", f"--user-data-dir={profile}", "--no-first-run",
                                 "--no-default-browser-check", "--disable-gpu", url], **quiet)
    subprocess.run(["open", "-g", "-a", "Safari", url], check=True, **quiet)
    return None


def close_safari_tabs(port):
    script = ('tell application "Safari" to close (every tab of every window '
              f'whose URL contains "127.0.0.1:{port}/tests/js/")')
    subprocess.run(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop(proc):
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


def run(kind, exe, timeout):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.done = threading.Event()
    server.report = None
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/tests/js/?report={int(time.time())}"
    profile = tempfile.mkdtemp(prefix="paradigm-js-tests-")
    proc = None
    try:
        proc = launch(kind, exe, url, profile)
        finished = server.done.wait(timeout)
    finally:
        stop(proc)
        if kind == "safari":
            close_safari_tabs(port)
        server.shutdown()
        server.server_close()
        # Firefox on Windows can hold its profile for a moment after exiting.
        for _ in range(5):
            shutil.rmtree(profile, ignore_errors=True)
            if not os.path.exists(profile):
                break
            time.sleep(1)
    if not finished:
        print(f"TESTS FAIL: no result from {kind} in {timeout} s. A test module probably failed to "
              "load: open tests/js/ in a browser to see the error.")
        return 1
    report = server.report or {}
    for line in report.get("failures", []):
        print(line)
    summary = report.get("summary", "FAIL no summary")
    print(f"TESTS {summary} ({kind})")
    if kind == "safari":
        print("Safari: focus and key tests fail in a background tab; this run decides nothing.")
    return 0 if summary.startswith("PASS") else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--browser", default="auto", choices=["auto", "firefox", "chrome", "edge", "safari"])
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args(argv)
    # A Windows console may not hold every character a test or a code line prints.
    sys.stdout.reconfigure(errors="replace")
    browsers = find_browsers()
    if args.browser == "auto":
        browsers = [b for b in browsers if b[0] != "safari"]
    else:
        browsers = [b for b in browsers if b[0] == args.browser]
    if not browsers:
        print("TESTS FAIL: no headless browser found to run the JS tests. Install Firefox "
              "(Mac: brew install --cask firefox), or pass --browser safari for a rough run.")
        return 2
    kind, exe = browsers[0]
    return run(kind, exe, args.timeout)


if __name__ == "__main__":
    sys.exit(main())
