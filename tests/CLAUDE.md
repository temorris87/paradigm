# tests/

## Layout
```
tests/python/            unittest; helpers.py runs a real server on a free port
                         (test_theme_tokens.py: no --nordN or raw colour outside
                         static/css/themes/, every theme has every _template.css token,
                         every var() defined, every themes.js file exists;
                         test_theme_contrast.py: nord-light's text at 4.5:1 on its surfaces,
                         focus at 3:1, TEXT_SOLIDS equal to the fills --text-on-solid is on;
                         msg_fixture.py: writes sample Outlook .msg compound files, made-up
                         senders and subjects only, never a real email)
tests/js/                index.html runner, harness.js, fakes.js, editor-helpers.js, test_*.js
                         (test_editor_vim_cases.js: key sequences checked against real Vim;
                         test_key_hints.js: every hint: key bound in its table;
                         test_follow_hints.js: f's labels and matching, and on a small
                         fixture: labels drawn, a label typed clicks, Esc clears, a redraw
                         draws them again, the focus left where a click would;
                         test_import_panel.js: the Import panel's show rule and texts;
                         test_calendar_import_wiring.js: a real CalendarPage on a fake API
                         and storage: the panel, Plan without it, uploads, gt/gc/j/k;
                         test_today_import.js: Today's panel, Not today, its uploads, the
                         free time left, To file events on the day;
                         test_focus_ring.js: every :focus-visible rule one of the two rings;
                         test_settings.js: the Settings page, and the focus kept after
                         Save, Add holiday, a holiday's Remove and an Unlink)
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
   `console`, `shot`, `windows`, `window N`, `stop` (its docstring has them all). It drives
   Google Chrome by default, through Chrome's own DevTools port (`tools/cdp.py`), so there is no
   chromedriver to install or keep in step with Chrome's updates. Without Chrome it falls back
   to Firefox, which needs geckodriver (`brew install geckodriver` on a Mac,
   `winget install Mozilla.GeckoDriver` on Windows). The JS tests run in Chrome first too
   (`run_js_tests.py`; CI runs Chrome and Firefox).
4. Report what was tested and what wasn't, such as Windows-specific behaviour Tyson must check
   at work.
