"""Which browser tabs are open, and when the server should stop.

Each tab holds one event stream and, when it is really closed, sends a "closing"
beacon. When the last stream drops, a stop deadline is armed:
- the idle period (60 s) by default, because some browsers (Safari closing a tab, a
  browser that quits or crashes) never send the beacon;
- the shorter grace period (10 s) if the last tab to leave sent a beacon, before or
  after its stream dropped. A beacon from any other tab does not count.
Any tab that connects before the deadline (a reload, a reopened tab, a network blip)
cancels it.

Wake guard: should_stop is polled every fraction of a second, so two checks far apart
mean the machine was asleep. The deadline then restarts from that check with its full
period, so the server never stops the moment the machine wakes.
"""
import threading
import time
from typing import Callable, Dict, Optional, Set

# Checks further apart than this mean the machine slept (they normally run every 0.25 s).
WAKE_GAP_SECONDS = 5.0

BEACON = "beacon"
IDLE = "idle"


class Presence:
    def __init__(self, grace_seconds: float, idle_seconds: float,
                 clock: Callable[[], float] = time.monotonic):
        self._periods = {BEACON: grace_seconds, IDLE: idle_seconds}
        self._clock = clock
        self._lock = threading.Lock()
        self._streams: Dict[str, int] = {}  # tab id -> open streams
        self._closing: Set[str] = set()  # tabs that sent a closing beacon
        self._last_left: Optional[str] = None
        self._stop_at: Optional[float] = None
        self._reason: Optional[str] = None
        self._last_check: Optional[float] = None

    @property
    def tab_count(self) -> int:
        with self._lock:
            return len(self._streams)

    @property
    def stop_reason(self) -> Optional[str]:
        """Why the latest deadline was armed: "beacon" or "idle" (None before any).
        Kept after a reconnect cancels it, so a stop that just fired can still be logged."""
        with self._lock:
            return self._reason

    def connect(self, tab_id: str) -> None:
        with self._lock:
            self._streams[tab_id] = self._streams.get(tab_id, 0) + 1
            self._closing.discard(tab_id)
            self._stop_at = None

    def disconnect(self, tab_id: str) -> None:
        with self._lock:
            count = self._streams.get(tab_id, 0) - 1
            if count > 0:
                self._streams[tab_id] = count
                return
            self._streams.pop(tab_id, None)
            if self._streams:
                return
            self._last_left = tab_id
            self._arm(IDLE)
            if tab_id in self._closing:
                self._arm(BEACON)

    def closing(self, tab_id: str) -> None:
        """A tab is being closed. The beacon may arrive before or after its stream drops."""
        with self._lock:
            self._closing.add(tab_id)
            if not self._streams and self._stop_at is not None and self._last_left == tab_id:
                self._arm(BEACON)

    def should_stop(self) -> bool:
        with self._lock:
            now = self._clock()
            slept = self._last_check is not None and now - self._last_check > WAKE_GAP_SECONDS
            self._last_check = now
            if self._stop_at is None:
                return False
            if slept and self._reason is not None:
                self._stop_at = now + self._periods[self._reason]
            return now >= self._stop_at

    def _arm(self, reason: str) -> None:
        """Arms the deadline for this reason, unless an earlier one is already armed."""
        stop_at = self._clock() + self._periods[reason]
        if self._stop_at is None or stop_at < self._stop_at:
            self._stop_at = stop_at
            self._reason = reason
