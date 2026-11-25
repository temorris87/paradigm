# 003 A second Ctrl-C while stopping no longer cuts the stop short

Status: built (2026-11-25)
Backlog item: "A second Ctrl-C while Paradigm is stopping leaves it half-stopped (no "Paradigm stopped" in the log, the tidy-up skipped)"
Decided with Tyson: 2026-11-25
Lanes: backend (integrate: false; no route changes)
Migration: none

## Why
`paradigm/app.py` `run()` catches the first Ctrl-C (`KeyboardInterrupt` out of `wait_for_stop`),
logs "Stopping (Ctrl-C)", then calls `server.stop()`. That runs `shutdown()` (it waits up to
0.5 s for the serve loop), `server_close()`, then the `on_close` hooks in order: `tidy_at_stop`
(trash purge, image sweep) and `db.close`. A second Ctrl-C during any of that raises a new
`KeyboardInterrupt` part-way through. Nothing catches it: `main()` only catches `Exception`, so
Python prints a traceback, the remaining hooks never run (the tidy-up is skipped and the database
is not closed cleanly), and "Paradigm stopped" is never logged. The same can happen when a Ctrl-C
lands while Paradigm is already stopping because the last tab closed.

## What it does
- Once Paradigm has decided to stop (Ctrl-C, last tab closed, or no tab for 60 s), any further
  Ctrl-C is **ignored** until the stop has finished. Each press logs one line, "Already stopping
  - please wait" (default, approved by Tyson, 2026-11-25). The stop then runs to the end as usual:
  tidy-up, database closed, "Paradigm stopped", exit code 0.
- There is no force-quit on a third press (default, approved by Tyson, 2026-11-25). Stopping takes
  a second or two. Closing the console window still ends it if anything ever hangs.
- Before the stop starts, the first Ctrl-C behaves exactly as it does now ("Stopping (Ctrl-C)").
- `paradigm.pyw` has no console and so no Ctrl-C: nothing changes there.

## Data
None. No migration and no change to trash, restore, archive or purge. The tidy-up at stop
(`tidy_at_stop`) runs as it does now, and now always runs to the end.

## API contract
No change.

## Files
- Backend lane:
  - `paradigm/stopping.py` (new, one job): a context manager `ctrl_c_ignored(on_press)`. While it
    is active, it swaps the `SIGINT` handler for one that only calls `on_press()`. That handler
    raises nothing, so nothing in the stop is interrupted part-way. On exit it restores the
    previous handler, even when the body raised. `signal.signal` only works in the main thread,
    so off the main thread (the tests run `run()` in a thread) it does nothing. Ctrl-C is
    `SIGINT` on Windows, Mac and Linux alike; 3.11 stdlib only.
  - `paradigm/app.py` `run()`: wrap the stopping part, from right after the wait ends (whichever
    way it ends) through `server.stop()` and the "Paradigm stopped" log line, in
    `with ctrl_c_ignored(lambda: log.info("Already stopping - please wait")):`. Keep functions
    short: move the stop sequence into a small helper if it reads better.
  - `tests/python/test_stopping.py` (new), `tests/python/test_app.py`.
- Frontend lane: none.

## Acceptance checks
1. `ctrl_c_ignored` in the main thread: `signal.raise_signal(signal.SIGINT)` inside it raises
   nothing and calls `on_press` once per signal. After it exits, the previous handler is back
   (raising the signal then gives `KeyboardInterrupt` again).
2. `ctrl_c_ignored` off the main thread: no error, and the handler is untouched.
3. The handler is restored even when the body raises.
4. `run()` called on the main thread with `wait_for_stop` patched to raise `KeyboardInterrupt`,
   and a second `SIGINT` raised during `server.stop()` (for example from an `on_close` hook placed
   before the tidy-up): `run()` returns 0, the tidy-up and `db.close` both ran, and the log holds
   "Stopping (Ctrl-C)", then "Already stopping - please wait", and ends with "Paradigm stopped".
5. The same with the stop started by the last tab closing (a beacon) and a `SIGINT` raised during
   the stop: the same result, and the log holds "Last tab closed" and ends with "Paradigm stopped".
6. A real process (Mac or Linux, on sample data in a temporary `--data`, `--no-browser`, a free
   port): send `SIGINT`, then a second `SIGINT` about 0.1 s later. The process exits 0,
   `paradigm.log` ends with "Paradigm stopped" and holds no traceback, and the port is free
   afterwards. (Ctrl-C in a Windows console is left for Tyson to try by hand.)
7. A single Ctrl-C still stops it as before: "Stopping (Ctrl-C)" ... "Paradigm stopped".

## Not in this feature
- Ctrl-C during startup, while the database opens and migrates: it still ends with a traceback,
  and the existing cleanup closes the database (default, approved by Tyson, 2026-11-25: a
  separate item if wanted).
- Ctrl-Break on Windows (`SIGBREAK`) and closing the console window: unchanged.
- A force-quit on a third Ctrl-C.

## As built
- Built as planned, backend only; there were no fix rounds. The API contract is unchanged.
- The stop sequence moved into a helper, `app.stop_server(server, reason)`. `run()` now only
  picks the reason line ("Stopping (Ctrl-C)", "Last tab closed" or "No tab for 60 s"); the
  helper logs it inside `ctrl_c_ignored`, then runs `server.stop()` and logs "Paradigm stopped".
- `ctrl_c_ignored` puts back `SIG_DFL` when the previous handler was not set from Python
  (`signal.getsignal` returned `None`).
- `paradigm/CLAUDE.md` lists `stopping.py` and notes the rule beside the auto-stop notes.
- Checks 1 to 5 by the unit tests (`tests/python/test_stopping.py`, `tests/python/test_app.py`),
  6 and 7 by sending `SIGINT` to a real server process on a temporary `--data`. Left for Tyson:
  Ctrl-C in a Windows console.
