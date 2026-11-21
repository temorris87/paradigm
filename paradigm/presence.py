"""Which browser tabs are open, and when the server should stop.

Each tab holds one event stream and, when it is really closed, sends a "closing"
beacon. The server stops only when no tab is connected, the last tab to leave sent
a beacon, and nothing reconnects within the grace period (a reload reconnects).
A stream that drops without a beacon (sleep, a sleeping tab, a network blip) never
stops the server.
"""
import threading
import time
from typing import Callable, Dict, Optional, Set


class Presence:
    def __init__(self, grace_seconds: float, clock: Callable[[], float] = time.monotonic):
        self._grace = grace_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._streams: Dict[str, int] = {}  # tab id -> open streams
        self._closing: Set[str] = set()  # tabs that sent a closing beacon
        self._last_left: Optional[str] = None
        self._stop_at: Optional[float] = None

    @property
    def tab_count(self) -> int:
        with self._lock:
            return len(self._streams)

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
            if not self._streams:
                self._last_left = tab_id
            self._arm()

    def closing(self, tab_id: str) -> None:
        """A tab is being closed. The beacon may arrive before or after its stream drops."""
        with self._lock:
            self._closing.add(tab_id)
            self._arm()

    def should_stop(self) -> bool:
        with self._lock:
            return self._stop_at is not None and self._clock() >= self._stop_at

    def _arm(self) -> None:
        if self._stop_at is not None or self._streams:
            return
        if self._last_left is not None and self._last_left in self._closing:
            self._stop_at = self._clock() + self._grace
