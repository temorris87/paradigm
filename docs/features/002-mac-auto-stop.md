# 002 Server stops on Mac too (no beacon from Safari's tab close)

Status: built (2026-11-25)
Backlog item: "Auto shutoff of the server does not work on Mac"
Decided with Tyson: 2026-11-25
Lanes: backend (integrate: false; no route changes)
Migration: none

## Why
Today the server stops only when no tab is connected, the last tab to leave sent a
`POST /api/closing` beacon on `pagehide`, and nothing reconnects within 10 s
(`paradigm/presence.py`). Without a beacon it never stops.

On the Mac, the default browser is Safari. The local log shows that Safari sends the beacon when
a tab is reloaded but not when it is closed: the stream drops, no beacon arrives, and the server
runs on until Ctrl-C. Chrome and Edge on Windows do send it.

## What it does
- **With a beacon:** no change. Close the last tab and Paradigm stops 10 s later
  (`Config.grace_seconds`).
- **Without a beacon** (Safari's tab close, a browser that quits or crashes, a discarded tab):
  when no tab has been connected for 60 s (`Config.idle_seconds`), Paradigm stops anyway
  (default, approved by Tyson, 2026-11-25). There is no command-line flag for it. The log says
  "No tab for 60 s" here, and "Last tab closed" when a beacon set the stop.
- **Wake guard.** If two `should_stop` checks are more than 5 s apart (they normally run every
  0.25 s), the machine was probably asleep. Any armed deadline then restarts from that check,
  with its full period (10 s for a beacon, 60 s for idle), so the server never stops the moment
  the machine wakes.
- A tab that reconnects before the deadline (a reload, Safari's Undo Close Tab, a network blip)
  cancels it, as a reconnect does today.
- A beacon only shortens the deadline when it comes from the last tab to leave. It may arrive
  before or after that tab's stream drops.

## Data
None. No migration and no change to trash, restore, archive or purge. The tidy-up at stop
(`tidy_at_stop`) runs as it does now.

## API contract
No change: `/api/ping`, `/api/events` and `/api/closing` stay exactly as they are.

## Files
- Backend lane:
  - `paradigm/presence.py`: `Presence(grace_seconds, idle_seconds, clock=time.monotonic)`.
    When the last stream drops, it arms `stop_at = now + idle`. A beacon from the last tab to
    leave shortens that to `now + grace` (or arms it there), whichever is earlier. `connect`
    clears it. `should_stop` applies the wake guard (`WAKE_GAP_SECONDS = 5`). A `stop_reason`
    property ("beacon" or "idle") lets `app.py` log why. Update the module docstring.
  - `paradigm/config.py`: `idle_seconds: float = 60.0`.
  - `paradigm/app.py`: pass `config.idle_seconds` to `Presence`, and log "Last tab closed" or
    "No tab for N s" from `stop_reason`.
  - `tests/python/test_presence.py`, `tests/python/test_app.py`, `tests/python/test_config.py`.
- Frontend lane: none. The beacon stays as it is (default, approved by Tyson, 2026-11-25).

## Acceptance checks
1. A beacon, then the stream drops, with no reconnect: `should_stop` is false at 9.9 s and true
   at 10 s. The same holds when the drop comes before the beacon.
2. A stream drops with no beacon: `should_stop` is false at 59.9 s and true at 60 s, with a
   reason of "idle".
3. The stream drops with no beacon, and a tab reconnects at 30 s: nothing stops, even at 120 s.
4. Two tabs; one leaves without a beacon and the other stays: nothing stops, even at 120 s.
5. A beacon from a tab that is not the last to leave (it reconnected, or another tab is still
   open) does not shorten the idle deadline once the last tab drops without a beacon.
6. Wake guard: the stream drops with no beacon, then the clock jumps 2 hours between two
   checks. `should_stop` is false on the first check after the jump and true 60 s after it. The
   same holds for the 10 s beacon deadline.
7. A reload (beacon, drop, reconnect within 1 s) never stops it.
8. Run on generated sample data in a temporary `--data`: open the page in headless Chrome, then
   kill the browser so no `pagehide` runs. The process exits by itself within about 60–65 s. The
   log has "No tab for 60 s", then "Paradigm stopped".
9. Same run, but close the tab normally (beacon sent): the process exits in about 10 s, and the
   log says "Last tab closed".
10. With the page open and idle for over 2 minutes, the server keeps running.

## Not in this feature
- No frontend change to make Safari's beacon get out (`fetch` keepalive, `visibilitychange`)
  (default, approved by Tyson, 2026-11-25).
- A second Ctrl-C landing inside `server.stop()` (the log shows Ctrl-C stops with no "Paradigm
  stopped" after them). It is to be suggested as its own backlog item (default, approved by
  Tyson, 2026-11-25).
- On the Mac, the Terminal window that stays open as "[Process completed]" after Paradigm stops
  is a Terminal setting.

## As built
- Built as planned, backend only; there were no fix rounds. The API contract is unchanged.
- `presence.py` exports the reasons as constants, `BEACON` and `IDLE`; `app.py` imports `IDLE`
  and builds the log line in a small `stop_message(reason, idle_seconds)`.
- A beacon is remembered for its tab. When it comes before the drop, the drop arms the idle
  deadline and then the beacon one, which is earlier, so the reason is "beacon". When it comes
  after, it is honoured only if the stop is armed and its tab was the last to leave.
- `stop_reason` keeps its value after a reconnect cancels the deadline, so a stop that has just
  fired is still logged with its reason.
- `tests/python/helpers.py` (`RunningServer(idle_seconds=60.0)`) and
  `tests/python/test_images_api.py` also changed, for the new `Presence` signature.
- Checks 1 to 10 passed (1 to 7 on `Presence` with a fake clock, 8 to 10 live in Chrome on a
  temporary `--data`). Left for Tyson: closing a Safari tab on the Mac, and a real sleep and wake.
