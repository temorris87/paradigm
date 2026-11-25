# Windows findings
Fill this in as we learn: Python version and source, browser, whether localhost is allowed, and
how the app is launched.
- Double-clicking `paradigm.py` works (2026-11-21). It opens a PowerShell console window, and
  closing that window stops the server.
- A refused connection to an empty local port takes about 2 s on Windows. Never probe a port
  before binding it: bind first, and probe only when the bind fails.
- Double-clicking `paradigm.pyw` works with no window. In Chrome, closing the last tab stops
  the server, with the security checks on (2026-11-21). The windowless process shows in Task
  Manager as `pythonw.exe`; `http://127.0.0.1:8765/api/ping` answers when it is running.
- Python 3.11.1. Browser: Chrome. Add `127.0.0.1` under Settings, Performance, "Always keep
  these sites active" so Memory Saver never unloads the app's tab.
- Vimium (and similar Vim extensions) catches Escape in text fields before the page sees it,
  so the editor stays in insert mode. Exclude `127.0.0.1` in the extension's settings
  (2026-11-21). The page cannot win this: the extension's handler runs first.
