# tests/

## Layout
```
tests/python/            unittest; helpers.py runs a real server on a free port
tests/js/                index.html runner, harness.js, fakes.js, editor-helpers.js, test_*.js
                         (test_editor_vim_cases.js: key sequences checked against real Vim)
                         markdown-sample.html: dev-only page rendering every Markdown construct
                         preview-sample.html: dev-only live preview; ?keys=... feeds Vim keys
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
3. Check the behaviour in a real browser on sample data, including the keys.
4. Report what was tested and what wasn't, such as Windows-specific behaviour Tyson must check
   at work.
