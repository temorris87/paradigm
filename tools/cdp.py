"""Drive Chrome through its DevTools Protocol, with no chromedriver, for tools/browser_drive.py.

Chrome runs with --remote-debugging-port on 127.0.0.1. Each command connects to the browser's
WebSocket, attaches to one page (a "target") and speaks JSON to it. Because it needs no driver,
there is no driver version to keep in step with Chrome's own updates. Python has no WebSocket
client in its standard library, so a minimal one (RFC 6455, client side) is here.
"""
import base64
import hashlib
import json
import os
import socket
import struct
import time
import urllib.request

# Keys that aren't characters: (key, code, Windows virtual key code, text it types).
SPECIAL = {
    "Enter": ("Enter", "Enter", 13, "\r"), "Escape": ("Escape", "Escape", 27, ""),
    "Esc": ("Escape", "Escape", 27, ""), "Tab": ("Tab", "Tab", 9, ""),
    "Backspace": ("Backspace", "Backspace", 8, ""), "Delete": ("Delete", "Delete", 46, ""),
    "Space": (" ", "Space", 32, " "), "Up": ("ArrowUp", "ArrowUp", 38, ""),
    "Down": ("ArrowDown", "ArrowDown", 40, ""), "Left": ("ArrowLeft", "ArrowLeft", 37, ""),
    "Right": ("ArrowRight", "ArrowRight", 39, ""), "Home": ("Home", "Home", 36, ""),
    "End": ("End", "End", 35, ""), "PageUp": ("PageUp", "PageUp", 33, ""),
    "PageDown": ("PageDown", "PageDown", 34, ""), "F1": ("F1", "F1", 112, ""), "F2": ("F2", "F2", 113, ""),
}
# CDP's modifier bits.
MODIFIER_BITS = {"Alt": 1, "Ctrl": 2, "Control": 2, "Meta": 4, "Cmd": 4, "Shift": 8}
SHIFTED = '~!@#$%^&*()_+{}|:"<>?'


class CdpError(Exception):
    pass


# --- WebSocket ------------------------------------------------------------------------------

class WebSocket:
    def __init__(self, url, timeout=30):
        rest = url.split("://", 1)[1]
        hostport, path = rest.split("/", 1)
        host, port = hostport.rsplit(":", 1)
        self.sock = socket.create_connection((host, int(port)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        # No Origin header: Chrome only checks the origin of clients that send one.
        request = (f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
                   f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(request.encode("ascii"))
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise CdpError("the browser closed the connection during the handshake")
            head += chunk
        head, self.buffer = head.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise CdpError(f"the browser refused the connection: {head.splitlines()[0].decode('latin-1')}")
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        if accept not in head:
            raise CdpError("the browser's handshake answer does not match")

    def send(self, text):
        payload = text.encode("utf-8")
        header = bytearray([0x81])  # FIN, text
        size = len(payload)
        if size < 126:
            header.append(0x80 | size)
        elif size < 1 << 16:
            header += bytes([0x80 | 126]) + struct.pack("!H", size)
        else:
            header += bytes([0x80 | 127]) + struct.pack("!Q", size)
        mask = os.urandom(4)  # a client must mask what it sends
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + mask + masked)

    def _read(self, n):
        while len(self.buffer) < n:
            chunk = self.sock.recv(max(65536, n - len(self.buffer)))
            if not chunk:
                raise CdpError("the browser closed the connection")
            self.buffer += chunk
        out, self.buffer = self.buffer[:n], self.buffer[n:]
        return out

    def recv(self):
        """The next whole text message, answering pings on the way."""
        parts = []
        while True:
            first, second = self._read(2)
            opcode, size = first & 0x0F, second & 0x7F
            if size == 126:
                size = struct.unpack("!H", self._read(2))[0]
            elif size == 127:
                size = struct.unpack("!Q", self._read(8))[0]
            mask = self._read(4) if second & 0x80 else None
            data = self._read(size)
            if mask:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            if opcode == 0x8:
                raise CdpError("the browser closed the connection")
            if opcode == 0x9:
                self._control(0xA, data)
                continue
            if opcode in (0x1, 0x2, 0x0):
                parts.append(data)
                if first & 0x80:
                    return b"".join(parts).decode("utf-8")

    def _control(self, opcode, data):
        mask = os.urandom(4)
        self.sock.sendall(bytes([0x80 | opcode, 0x80 | len(data)]) + mask +
                          bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def close(self):
        try:
            self._control(0x8, b"")
        except OSError:
            pass
        self.sock.close()


# --- Chrome ---------------------------------------------------------------------------------

def find_chrome():
    import run_js_tests  # tools/ is on sys.path (browser_drive puts it there)
    for kind, exe in run_js_tests.find_browsers():
        if kind == "chrome":
            return exe
    return None


def chrome_args(exe, port, profile, headless):
    args = [exe, f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "--no-first-run",
            "--no-default-browser-check", "--disable-extensions", "--window-size=1400,900",
            "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
            # Paradigm opens its note window itself; Tyson's Chrome allows that once for the site.
            "--disable-popup-blocking", "about:blank"]
    if headless:
        args.insert(1, "--headless=new")
    return args


def http_json(port, path, timeout=5):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_ready(port, seconds=30):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        try:
            return http_json(port, "/json/version", timeout=2)["webSocketDebuggerUrl"]
        except (OSError, KeyError, ValueError):
            time.sleep(0.2)
    raise CdpError("Chrome did not open its DevTools port (see chrome.log)")


def pages(port):
    """The open pages (windows and tabs): {target id: its address}."""
    return {t["id"]: t.get("url", "") for t in http_json(port, "/json/list") if t.get("type") == "page"}


class Browser:
    """One connection to Chrome. Commands go to the browser, or to a page through its session."""

    def __init__(self, port):
        self.port = port
        self.ws = WebSocket(wait_ready(port, 5))
        self.next_id = 0
        self.events = []

    def call(self, method, params=None, session=None, timeout=60):
        self.next_id += 1
        message = {"id": self.next_id, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        self.ws.send(json.dumps(message))
        self.ws.sock.settimeout(timeout)
        while True:
            reply = json.loads(self.ws.recv())
            if reply.get("id") == self.next_id:
                if "error" in reply:
                    raise CdpError(f"{method}: {reply['error'].get('message')}")
                return reply.get("result", {})
            if "method" in reply:
                self.events.append(reply)

    def event(self, timeout=None):
        """The next event (for the console listener)."""
        if self.events:
            return self.events.pop(0)
        self.ws.sock.settimeout(timeout)
        while True:
            message = json.loads(self.ws.recv())
            if "method" in message:
                return message

    def attach(self, target):
        session = self.call("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        return Page(self, session, target)

    def close(self):
        self.ws.close()


class Page:
    def __init__(self, browser, session, target):
        self.browser = browser
        self.session = session
        self.target = target
        # Headless, a page never has the OS focus, so focus events would not fire: pretend it does.
        self.call("Emulation.setFocusEmulationEnabled", {"enabled": True})

    def call(self, method, params=None, timeout=60):
        return self.browser.call(method, params, self.session, timeout)

    def run(self, script, *args):
        """Runs a function body (`return ...` as in WebDriver) on the page; returns its value."""
        expression = f"(async function () {{ {script}\n}}).apply(null, {json.dumps(list(args))})"
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True,
                                                "awaitPromise": True, "userGesture": True})
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            raise CdpError((details.get("exception") or {}).get("description") or details.get("text", "script failed"))
        return result.get("result", {}).get("value")

    def go(self, url):
        # Mark the page being left, so a reload of the same address isn't taken as loaded already.
        try:
            self.run("window.__pdLeaving = true;")
        except CdpError:
            pass
        self.call("Page.navigate", {"url": url})
        end = time.monotonic() + 30
        while time.monotonic() < end:
            time.sleep(0.2)
            try:
                if self.run("return !window.__pdLeaving && document.readyState === 'complete';"):
                    return
            except CdpError:
                pass  # mid-navigation
        raise CdpError(f"the page did not load: {url}")

    def click(self, css):
        box = self.run("const el = document.querySelector(arguments[0]); if (!el) return null;"
                       "el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect();"
                       "return [r.left + r.width / 2, r.top + r.height / 2];", css)
        if box is None:
            raise CdpError(f"nothing matches {css}")
        x, y = box
        for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1})

    def keys(self, tokens):
        """Presses keys as a person would. tokens: [(modifier names, key)] from webdriver.parse_keys
        with names kept (see key_event)."""
        for mods, name in tokens:
            bits = sum(MODIFIER_BITS[m] for m in mods)
            down, up = key_event(name, bits)
            self.call("Input.dispatchKeyEvent", down)
            self.call("Input.dispatchKeyEvent", up)

    def screenshot(self, path):
        data = self.call("Page.captureScreenshot", {"format": "png"})["data"]
        with open(path, "wb") as out:
            out.write(base64.b64decode(data))


def key_event(name, bits):
    """keyDown/keyUp params for a key name ('Enter') or a character ('x', 'G', ':')."""
    if name in SPECIAL:
        key, code, vk, text = SPECIAL[name]
    else:
        key, text = name, name
        upper = name.upper()
        if len(name) == 1 and upper.isalpha() and upper.isascii():
            code, vk = f"Key{upper}", ord(upper)
            if name.isupper():
                bits |= MODIFIER_BITS["Shift"]
        elif len(name) == 1 and name.isdigit():
            code, vk = f"Digit{name}", ord(name)
        else:
            code, vk = "", 0
            if name in SHIFTED:
                bits |= MODIFIER_BITS["Shift"]
    # With Ctrl, Alt or Meta held a key types nothing: it is a shortcut.
    if bits & (MODIFIER_BITS["Ctrl"] | MODIFIER_BITS["Alt"] | MODIFIER_BITS["Meta"]):
        text = ""
    down = {"type": "keyDown" if text else "rawKeyDown", "key": key, "code": code,
            "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk, "modifiers": bits}
    if text:
        down["text"] = text
        down["unmodifiedText"] = text
    up = {"type": "keyUp", "key": key, "code": code, "windowsVirtualKeyCode": vk,
          "nativeVirtualKeyCode": vk, "modifiers": bits}
    return down, up


# --- The console listener -------------------------------------------------------------------

def listen(port, log_path):
    """Runs until Chrome closes: every page's console errors, uncaught exceptions and browser log
    errors (CSP, failed loads) go to log_path, one per line, from the moment each page opens."""
    browser = Browser(port)
    attached = set()

    def attach(target):
        if target in attached:
            return
        attached.add(target)
        session = browser.call("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        for method in ("Runtime.enable", "Log.enable"):
            browser.call(method, {}, session)
        # This session stays attached, so the page keeps behaving as focused between commands.
        browser.call("Emulation.setFocusEmulationEnabled", {"enabled": True}, session)

    browser.call("Target.setDiscoverTargets", {"discover": True})
    for target in pages(port):
        attach(target)
    with open(log_path, "a", encoding="utf-8") as log:
        log.write("listening\n")
        log.flush()
        while True:
            try:
                event = browser.event()
            except (CdpError, OSError):
                return
            line = describe(event)
            if event["method"] == "Target.targetCreated" and event["params"]["targetInfo"].get("type") == "page":
                attach(event["params"]["targetInfo"]["targetId"])
            if line:
                log.write(line.replace("\n", " ")[:800] + "\n")
                log.flush()


def describe(event):
    method, params = event["method"], event.get("params", {})
    if method == "Runtime.consoleAPICalled" and params.get("type") in ("error", "assert"):
        texts = [str(a.get("value", a.get("description", ""))) for a in params.get("args", [])]
        return "console.error: " + " ".join(texts)
    if method == "Runtime.exceptionThrown":
        details = params.get("exceptionDetails", {})
        return "uncaught: " + ((details.get("exception") or {}).get("description") or details.get("text", ""))
    if method == "Log.entryAdded" and params.get("entry", {}).get("level") == "error":
        entry = params["entry"]
        return f"{entry.get('source', 'browser')}: {entry.get('text', '')} {entry.get('url', '')}".strip()
    return None
