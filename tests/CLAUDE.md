# tests/

## Layout
```
tests/python/            unittest; helpers.py runs a real server on a free port
tests/js/                index.html runner, harness.js, fakes.js, editor-helpers.js, test_*.js
                         (test_editor_vim_cases.js: key sequences checked against real Vim)
                         markdown-sample.html: dev-only page rendering every Markdown construct
```

## Testing (every feature, before reporting it done)
1. Python: `python -m unittest discover tests/python` passes (add `-W error::ResourceWarning`
   to catch unclosed sockets).
2. JS: browsers won't load ES modules from `file://`, so serve the repo root:
   `python -m http.server 8766 --bind 127.0.0.1`, then open `http://127.0.0.1:8766/tests/js/`.
   The page title becomes `PASS n` or `FAIL n/m`. Headless on Linux:
   `firefox --headless -no-remote -profile <fresh dir> --screenshot out.png <url>`. Use a fresh
   profile every time, because a reused one serves cached JS. The screenshot can fire before
   async tests end: instead put `user_pref("devtools.console.stdout.content", true);` in the
   profile's `user.js`, run `firefox --headless -no-remote -profile <dir> <url>` under a
   timeout, and read the `TESTS PASS n` / `FAIL ...` lines the harness logs.
3. Check the behaviour in a real browser on sample data, including the keys:
   `python tools/browser_drive.py start`, then `api`, `keys`, `click`, `text`, `focus`,
   `console`, `shot`, `windows`, `window N`, `stop` (its docstring has them all). For a full,
   lived-in set of made-up data (Acme, Northwind), run `python tools/demo_data.py` after
   `start`. It refuses any instance browser_drive didn't start. It drives
   Google Chrome by default, through Chrome's own DevTools port (`tools/cdp.py`), so there is no
   chromedriver to install or keep in step with Chrome's updates. Without Chrome it falls back
   to Firefox, which needs geckodriver (`brew install geckodriver` on a Mac,
   `winget install Mozilla.GeckoDriver` on Windows). The JS tests run in Chrome first too
   (`run_js_tests.py`; CI runs Chrome and Firefox).
4. Report what was tested and what wasn't, such as Windows-specific behaviour Tyson must check
   at work.
