"""A small W3C WebDriver client over urllib, for the pipeline's browser check (tools/browser_drive.py).

It talks to a local driver (geckodriver for Firefox, safaridriver for Safari) on 127.0.0.1 only.
Standard library only, like the rest of the repo.
"""
import base64
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

# WebDriver's codes for keys that aren't characters, by the names browser_drive accepts in {...}.
KEYS = {
    "Enter": "", "Escape": "", "Esc": "", "Tab": "", "Backspace": "",
    "Delete": "", "Space": " ", "Up": "", "Down": "", "Left": "",
    "Right": "", "Home": "", "End": "", "PageUp": "", "PageDown": "",
    "Shift": "", "Ctrl": "", "Control": "", "Alt": "", "Meta": "",
    "Cmd": "", "F1": "", "F2": "",
}
MODIFIERS = {"Shift", "Ctrl", "Control", "Alt", "Meta", "Cmd"}
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"


class WebDriverError(Exception):
    pass


def find_driver(browser):
    """The driver binary for a browser, or None. Safari's ships with macOS."""
    name = {"firefox": "geckodriver", "safari": "safaridriver"}[browser]
    found = shutil.which(name)
    if found:
        return found
    if browser == "safari" and pathlib.Path("/usr/bin/safaridriver").exists():
        return "/usr/bin/safaridriver"
    return None


def start_driver(browser, port, log_path):
    """Starts the driver detached (it outlives this process); returns its pid."""
    binary = find_driver(browser)
    if not binary:
        raise WebDriverError(install_hint(browser))
    args = [binary, "--port", str(port)] if browser == "firefox" else [binary, "-p", str(port)]
    log = open(log_path, "ab")
    return detached(args, log).pid


def detached(args, log, cwd=None):
    kwargs = {"stdout": log, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL, "cwd": cwd}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(args, **kwargs)


def install_hint(browser):
    if browser == "safari":
        return "safaridriver is not enabled: run `safaridriver --enable` once (asks for your password)"
    if sys.platform == "darwin":
        return "geckodriver is not installed: `brew install geckodriver`"
    if os.name == "nt":
        return "geckodriver is not installed: `winget install Mozilla.GeckoDriver` (or put geckodriver.exe on PATH)"
    return "geckodriver is not installed: install it from your package manager (or put it on PATH)"


class Session:
    def __init__(self, port, session_id=None):
        self.base = f"http://127.0.0.1:{port}"
        self.id = session_id

    def call(self, method, path, payload=None, timeout=60):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        url = self.base + (f"/session/{self.id}{path}" if self.id and not path.startswith("/session") else path)
        req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as error:
            body = json.loads(error.read().decode("utf-8") or "{}")
            value = body.get("value") or {}
            raise WebDriverError(f"{value.get('error', error.code)}: {value.get('message', '')}".strip()) from None
        return body.get("value")

    def wait_ready(self, seconds=20):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            try:
                if (self.call("GET", "/status", timeout=2) or {}).get("ready", True):
                    return
            except (OSError, WebDriverError):
                pass
            time.sleep(0.2)
        raise WebDriverError("the driver did not start (see its log)")

    def open(self, browser, headless=True):
        options = {}
        if browser == "firefox":
            options["moz:firefoxOptions"] = {"args": ["-headless"] if headless else [],
                                             "prefs": {"focusmanager.testmode": True}}
        value = self.call("POST", "/session", {"capabilities": {"alwaysMatch": {"browserName": browser, **options}}})
        self.id = value["sessionId"]
        self.call("POST", "/window/rect", {"width": 1400, "height": 900})
        return self.id

    def close(self):
        if self.id:
            try:
                self.call("DELETE", "", timeout=15)
            except (OSError, WebDriverError):
                pass

    def go(self, url):
        self.call("POST", "/url", {"url": url})

    def run(self, script, *args):
        return self.call("POST", "/execute/sync", {"script": script, "args": list(args)})

    def find(self, css):
        return self.call("POST", "/element", {"using": "css selector", "value": css})[ELEMENT]

    def click(self, css):
        self.call("POST", f"/element/{self.find(css)}/click", {})

    def keys(self, text):
        """Presses keys on whatever has the focus, as a person would: text, with {Enter}, {Ctrl+k} etc."""
        actions = []
        for mods, name in parse_keys(text):
            key = KEYS.get(name, name) if len(name) > 1 else name
            for mod in mods:
                actions.append({"type": "keyDown", "value": KEYS[mod]})
            actions.append({"type": "keyDown", "value": key})
            actions.append({"type": "keyUp", "value": key})
            for mod in reversed(mods):
                actions.append({"type": "keyUp", "value": KEYS[mod]})
        self.call("POST", "/actions", {"actions": [{"type": "key", "id": "keyboard", "actions": actions}]})
        self.call("DELETE", "/actions")

    def screenshot(self, path):
        pathlib.Path(path).write_bytes(base64.b64decode(self.call("GET", "/screenshot")))

    def windows(self):
        return self.call("GET", "/window/handles")

    def switch(self, handle):
        self.call("POST", "/window", {"handle": handle})


def parse_keys(text):
    """'ab{Enter}{Ctrl+k}' -> [([], 'a'), ([], 'b'), ([], 'Enter'), (['Ctrl'], 'k')]: characters, and
    key names for the keys in braces. '{{' is a brace. Each backend turns names into its own codes."""
    out = []
    i = 0
    while i < len(text):
        if text.startswith("{{", i):
            out.append(([], "{"))
            i += 2
        elif text[i] == "{" and "}" in text[i:]:
            end = text.index("}", i)
            parts = text[i + 1:end].split("+")
            mods, name = parts[:-1], parts[-1]
            for mod in mods:
                if mod not in MODIFIERS:
                    raise WebDriverError(f"unknown modifier {mod!r} in {{{text[i + 1:end]}}}")
            if name not in KEYS and len(name) != 1:
                raise WebDriverError(f"unknown key {{{name}}}; known: {', '.join(sorted(KEYS))}")
            out.append((mods, name))
            i = end + 1
        else:
            out.append(([], text[i]))
            i += 1
    return out
