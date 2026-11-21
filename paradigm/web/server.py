"""The HTTP server: threaded, local-only, stoppable."""
import os
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Tuple

from paradigm.web.handler import RequestHandler
from paradigm.web.router import Router


class ParadigmServer(ThreadingHTTPServer):
    daemon_threads = True
    # On Windows SO_REUSEADDR lets a second program bind a port that is already in
    # use, so two servers could silently share 8765. Only reuse on POSIX, where it
    # just allows a quick restart.
    allow_reuse_address = os.name != "nt"

    def __init__(self, address: Tuple[str, int], router: Router, static_dir: Path):
        super().__init__(address, RequestHandler)
        self.router = router
        self.static_dir = static_dir
        # Set on shutdown: long-lived responses (event streams) end when it is set.
        self.stop_event = threading.Event()

    @property
    def port(self) -> int:
        return self.server_address[1]

    def start_in_thread(self) -> threading.Thread:
        thread = threading.Thread(target=self.serve_forever, name="paradigm-http", daemon=True)
        thread.start()
        return thread

    def stop(self) -> None:
        self.stop_event.set()
        self.shutdown()
        self.server_close()
