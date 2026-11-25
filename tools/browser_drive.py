"""Drive Paradigm in a real browser, one command at a time, for the pipeline's browser check.

`start` makes a temporary data folder, runs Paradigm on it (a free port, --no-browser), starts a
headless browser and opens the app. Chrome comes first, the browser Tyson uses at work: it is
driven through its DevTools Protocol (tools/cdp.py), so it needs no driver install. Firefox
(geckodriver) and Safari (safaridriver) go through WebDriver (tools/webdriver.py). Each later
command acts on that session; `stop` ends it and deletes the folder. State lives in
.pipeline/browser.json (not in git). Never touches ~/paradigm-notes.

  python tools/browser_drive.py start [--browser auto|chrome|firefox|safari] [--show]
  python tools/browser_drive.py api POST /api/note/create '{"title": "Acme"}'   # JSON out
  python tools/browser_drive.py go [/note.html?id=3]          # a path on the app (default /)
  python tools/browser_drive.py keys 'jj{Enter}'              # to the focused element, as typed;
                                  # {Enter} {Escape} {Tab} {Delete} {Up} {Ctrl+k} {Shift+Tab}, {{ = {
  python tools/browser_drive.py click 'button.add'            # a CSS selector
  python tools/browser_drive.py text ['.hub-panel']           # visible text (default: the page)
  python tools/browser_drive.py eval 'return document.activeElement.outerHTML'
  python tools/browser_drive.py focus                         # what has the focus, in one line
  python tools/browser_drive.py console [--all]               # errors since the last `console`
  python tools/browser_drive.py shot out.png                  # a screenshot (open it to look)
  python tools/browser_drive.py windows | window N            # list windows / switch to one
  python tools/browser_drive.py stop

Exit 3 when no browser can be driven (the message says what to install): the check then falls
back to the API, and says so.
"""
import argparse
import json
import os
import pathlib
import shutil
import signal
import socket
import sys
import tempfile
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import cdp  # noqa: E402  (tools/ is not a package)
import webdriver  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
STATE = REPO / ".pipeline" / "browser.json"
MARKER = ".paradigm-browser-check"

# WebDriver has no console log, so on Firefox and Safari this catcher is put into the page before
# each command (a navigation drops it); it misses what happens before the first command after a
# load. Chrome needs none: a listener process hears every page from the moment it opens.
CATCH_ERRORS = """
if (!window.__pdErrors) {
  window.__pdErrors = [];
  const keep = (text) => window.__pdErrors.push(String(text).slice(0, 500));
  const error = console.error.bind(console);
  console.error = (...args) => { keep(args.map(String).join(" ")); error(...args); };
  window.addEventListener("error", (event) => keep(`${event.message} (${event.filename}:${event.lineno})`));
  window.addEventListener("unhandledrejection", (event) => keep(`unhandled: ${event.reason?.message ?? event.reason}`));
}
"""
FOCUS = """
const el = document.activeElement;
if (!el || el === document.body) return "(nothing: the page body)";
const id = el.id ? `#${el.id}` : "";
const cls = el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : "";
const label = el.getAttribute("aria-label") || el.getAttribute("title") || (el.innerText || el.value || "").slice(0, 80);
return `<${el.tagName.toLowerCase()}${id}${cls}> ${label}`.trim();
"""


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def save(state):
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def load_state():
    if not STATE.is_file():
        raise SystemExit("no browser session: run `browser_drive.py start` first")
    return json.loads(STATE.read_text(encoding="utf-8"))


def wait_for_app(port, seconds=30):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=2):
                return
        except OSError:
            time.sleep(0.2)
    raise SystemExit("Paradigm did not start (see server.out in the check's folder)")


# --- The two kinds of session, behind one shape ---------------------------------------------

class ChromeSession:
    def __init__(self, state):
        self.state = state
        self.browser = cdp.Browser(state["debug_port"])
        self.page = self.browser.attach(state["target"])

    def run(self, script, *args):
        return self.page.run(script, *args)

    def go(self, url):
        self.page.go(url)

    def click(self, css):
        self.page.click(css)

    def keys(self, text):
        self.page.keys(webdriver.parse_keys(text))

    def screenshot(self, path):
        self.page.screenshot(path)

    def windows(self):
        """[(id, address)], numbered in the order the windows first opened, so N stays put."""
        open_now = cdp.pages(self.state["debug_port"])
        order = [t for t in self.state.get("windows", []) if t in open_now]
        order += [t for t in open_now if t not in order]
        self.state["windows"] = order
        save(self.state)
        return [(t, open_now[t]) for t in order]

    def switch(self, handle):
        self.state["target"] = handle
        save(self.state)

    def console(self, everything):
        log = pathlib.Path(self.state["root"], "console.log")
        lines = [l for l in log.read_text(encoding="utf-8").splitlines() if l != "listening"] if log.is_file() else []
        seen = 0 if everything else self.state.get("console_seen", 0)
        self.state["console_seen"] = len(lines)
        save(self.state)
        return lines[seen:]

    def close(self):
        self.browser.close()


class WebDriverSession:
    def __init__(self, state):
        self.state = state
        self.driver = webdriver.Session(state["driver_port"], state["session"])
        self.driver.run(CATCH_ERRORS)

    def run(self, script, *args):
        return self.driver.run(script, *args)

    def go(self, url):
        self.driver.go(url)
        self.driver.run(CATCH_ERRORS)

    def click(self, css):
        self.driver.click(css)

    def keys(self, text):
        self.driver.keys(text)

    def screenshot(self, path):
        self.driver.screenshot(path)

    def windows(self):
        return [(handle, "") for handle in self.driver.windows()]

    def switch(self, handle):
        self.driver.switch(handle)
        self.driver.run(CATCH_ERRORS)

    def console(self, everything):
        return self.driver.run("const e = window.__pdErrors || []; window.__pdErrors = []; return e;")

    def close(self):
        pass


def connect(state):
    return ChromeSession(state) if state["browser"] == "chrome" else WebDriverSession(state)


# --- start / stop ---------------------------------------------------------------------------

def pick_browser(asked):
    """The browser to use, or exits 3 with what to install."""
    if asked in ("auto", "chrome") and cdp.find_chrome():
        return "chrome"
    if asked in ("auto", "firefox") and webdriver.find_driver("firefox"):
        return "firefox"
    if asked == "safari" and webdriver.find_driver("safari"):
        return "safari"
    hint = {"chrome": "Google Chrome is not installed",
            "firefox": webdriver.install_hint("firefox"),
            "safari": webdriver.install_hint("safari")}.get(asked)
    print(hint or "no browser to drive: install Google Chrome (or Firefox with geckodriver)", file=sys.stderr)
    raise SystemExit(3)


def start(args):
    if STATE.is_file():
        raise SystemExit("a browser session is already running: `browser_drive.py stop` first")
    browser = pick_browser(args.browser)
    root = pathlib.Path(tempfile.mkdtemp(prefix="paradigm-check-"))
    (root / MARKER).write_text("made by tools/browser_drive.py; deleted by its stop\n", encoding="utf-8")
    app_port = free_port()
    server = webdriver.detached([sys.executable, str(REPO / "paradigm.py"), "--data", str(root / "data"),
                                 "--port", str(app_port), "--no-browser"], open(root / "server.out", "ab"), cwd=REPO)
    state = {"root": str(root), "app_port": app_port, "browser": browser, "server_pid": server.pid,
             "pids": [], "console_seen": 0}
    save(state)
    url = f"http://127.0.0.1:{app_port}/"
    try:
        wait_for_app(app_port)
        if browser == "chrome":
            start_chrome(state, args.show)
        else:
            start_webdriver(state, args.show)
        session = connect(state)
        session.go(url)
        session.close()
    except (cdp.CdpError, webdriver.WebDriverError, SystemExit, OSError) as error:
        stop(None)
        raise SystemExit(f"could not start the browser check: {error}")
    print(json.dumps({"url": url, "data": str(root / "data"), "browser": browser}))
    return 0


def start_chrome(state, show):
    root = pathlib.Path(state["root"])
    port = free_port()
    chrome = webdriver.detached(cdp.chrome_args(cdp.find_chrome(), port, str(root / "profile"), not show),
                                open(root / "chrome.log", "ab"))
    state.update(debug_port=port, pids=[chrome.pid])
    save(state)
    cdp.wait_ready(port)
    # The listener records every console error from here on, in every window.
    listener = webdriver.detached([sys.executable, str(pathlib.Path(__file__).resolve()), "_listen"],
                                  open(root / "listener.out", "ab"), cwd=REPO)
    state["pids"].append(listener.pid)
    state["target"] = next(iter(cdp.pages(port)))
    state["windows"] = [state["target"]]
    save(state)
    log = root / "console.log"
    end = time.monotonic() + 10
    while not (log.is_file() and log.read_text(encoding="utf-8").startswith("listening")):
        if time.monotonic() > end:
            raise cdp.CdpError("the console listener did not start (see listener.out)")
        time.sleep(0.1)


def start_webdriver(state, show):
    port = free_port()
    pid = webdriver.start_driver(state["browser"], port, pathlib.Path(state["root"]) / "driver.log")
    state.update(driver_port=port, pids=[pid])
    save(state)
    driver = webdriver.Session(port)
    driver.wait_ready()
    state["session"] = driver.open(state["browser"], headless=not show)
    save(state)


def listen(args):
    state = load_state()
    cdp.listen(state["debug_port"], pathlib.Path(state["root"]) / "console.log")
    return 0


def kill(pid):
    if not pid:
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass


def stop(args):
    if not STATE.is_file():
        print("no browser session")
        return 0
    state = json.loads(STATE.read_text(encoding="utf-8"))
    try:
        if state["browser"] == "chrome" and state.get("debug_port"):
            browser = cdp.Browser(state["debug_port"])
            browser.call("Browser.close", timeout=10)
        elif state.get("session"):
            webdriver.Session(state["driver_port"], state["session"]).close()
    except (cdp.CdpError, webdriver.WebDriverError, OSError):
        pass
    for pid in state.get("pids", []) + [state.get("server_pid")]:
        kill(pid)
    root = pathlib.Path(state["root"])
    if (root / MARKER).is_file():
        # The server and the browser let go of their files a moment after they stop (Windows).
        for _ in range(10):
            shutil.rmtree(root, ignore_errors=True)
            if not root.exists():
                break
            time.sleep(0.5)
    STATE.unlink()
    print("stopped; the check's folder is deleted" if not root.exists() else f"stopped; delete {root} by hand")
    return 0


# --- Commands on the session ----------------------------------------------------------------

def api(args):
    state = load_state()
    body = None if args.json is None else args.json.encode("utf-8")
    req = urllib.request.Request(f"http://127.0.0.1:{state['app_port']}{args.path}", data=body,
                                 method=args.method.upper(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(resp.read().decode("utf-8"))
            return 0
    except urllib.error.HTTPError as error:
        print(f"HTTP {error.code}: {error.read().decode('utf-8', 'replace')}")
        return 1


def acting(fn):
    def wrapped(args):
        state = load_state()
        try:
            session = connect(state)
        except (cdp.CdpError, webdriver.WebDriverError, OSError) as error:
            print(f"E: the browser is not answering ({error}); `stop`, then `start` again", file=sys.stderr)
            return 1
        try:
            return fn(args, state, session) or 0
        except (cdp.CdpError, webdriver.WebDriverError) as error:
            print(f"E: {error}", file=sys.stderr)
            return 1
        finally:
            session.close()
    return wrapped


@acting
def go(args, state, session):
    path = args.path if args.path.startswith("/") else "/" + args.path
    session.go(f"http://127.0.0.1:{state['app_port']}{path}")


@acting
def keys(args, state, session):
    session.keys(args.text)
    time.sleep(args.settle)  # the page answers keys asynchronously (API calls, redraws)


@acting
def click(args, state, session):
    session.click(args.css)
    time.sleep(args.settle)


@acting
def text(args, state, session):
    found = session.run("const el = arguments[0] ? document.querySelector(arguments[0]) : document.body;"
                        "return el ? el.innerText : null;", args.css)
    if found is None:
        print(f"E: nothing matches {args.css}", file=sys.stderr)
        return 1
    print(found[:args.max])


@acting
def evaluate(args, state, session):
    print(json.dumps(session.run(args.script), indent=2, ensure_ascii=False))


@acting
def focus(args, state, session):
    print(session.run(FOCUS))


@acting
def console(args, state, session):
    errors = session.console(args.all)
    print("\n".join(errors) if errors else "no errors logged")
    return 1 if errors else 0


@acting
def shot(args, state, session):
    session.screenshot(args.path)
    print(args.path)


@acting
def windows(args, state, session):
    current = state.get("target")
    for i, (handle, address) in enumerate(session.windows()):
        print(i, address or handle, "(current)" if handle == current else "")


@acting
def window(args, state, session):
    session.switch(session.windows()[args.n][0])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("start")
    p.add_argument("--browser", choices=("auto", "chrome", "firefox", "safari"), default="auto")
    p.add_argument("--show", action="store_true", help="a visible window, not headless")
    p.set_defaults(fn=start)
    p = sub.add_parser("api")
    p.add_argument("method")
    p.add_argument("path")
    p.add_argument("json", nargs="?")
    p.set_defaults(fn=api)
    p = sub.add_parser("go")
    p.add_argument("path", nargs="?", default="/")
    p.set_defaults(fn=go)
    for name, fn in (("keys", keys), ("click", click)):
        p = sub.add_parser(name)
        p.add_argument("text" if name == "keys" else "css")
        p.add_argument("--settle", type=float, default=0.4, help="seconds to wait after (default 0.4)")
        p.set_defaults(fn=fn)
    p = sub.add_parser("text")
    p.add_argument("css", nargs="?")
    p.add_argument("--max", type=int, default=20000)
    p.set_defaults(fn=text)
    p = sub.add_parser("eval")
    p.add_argument("script")
    p.set_defaults(fn=evaluate)
    p = sub.add_parser("console")
    p.add_argument("--all", action="store_true", help="every error since start, not only new ones")
    p.set_defaults(fn=console)
    p = sub.add_parser("shot")
    p.add_argument("path")
    p.set_defaults(fn=shot)
    p = sub.add_parser("window")
    p.add_argument("n", type=int)
    p.set_defaults(fn=window)
    for name, fn in (("focus", focus), ("windows", windows), ("stop", stop), ("_listen", listen)):
        sub.add_parser(name).set_defaults(fn=fn)
    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
