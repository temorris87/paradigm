"""Startup and shutdown: reuse a running Paradigm or start one, open the browser, stop when told."""
import logging
import os
import sys
import time
import webbrowser
from typing import Callable, List, Optional

from paradigm.api.session import SessionApi
from paradigm.config import Config, parse_args
from paradigm.instance import PortState, probe
from paradigm.logging_setup import setup_logging
from paradigm.presence import Presence
from paradigm.web.router import Router
from paradigm.web.server import ParadigmServer

log = logging.getLogger("paradigm")

OpenUrl = Callable[[str], object]
STOP_POLL_SECONDS = 0.25


class LaunchError(Exception):
    """A problem to explain to the user in plain words, without a traceback."""


def main(argv: Optional[List[str]] = None) -> int:
    config = parse_args(argv)
    try:
        log_path = setup_logging(config.data_dir)
    except OSError as error:
        print("Paradigm could not use its data folder {}: {}".format(config.data_dir, error))
        _pause_if_double_clicked()
        return 1
    try:
        return run(config)
    except LaunchError as error:
        log.error("%s", error)
    except Exception:
        log.exception("Paradigm stopped with an error (details in %s)", log_path)
    _pause_if_double_clicked()
    return 1


def run(config: Config, open_url: OpenUrl = webbrowser.open) -> int:
    if _open_existing(config, open_url):
        return 0
    presence = Presence(config.grace_seconds)
    try:
        server = build_server(config, presence)
    except OSError:
        # Another launch may have won the race for the port.
        if _open_existing(config, open_url):
            return 0
        raise LaunchError(
            "Port {} is in use by another program. Start Paradigm on another port: "
            "python paradigm.py --port 8766".format(config.port)
        )
    server.start_in_thread()
    log.info("Paradigm running at %s - close the last tab to stop", config.url)
    if config.open_browser:
        open_url(config.url)
    try:
        wait_for_stop(presence)
        log.info("Last tab closed")
    except KeyboardInterrupt:
        log.info("Stopping (Ctrl-C)")
    server.stop()
    log.info("Paradigm stopped")
    return 0


def build_server(config: Config, presence: Presence) -> ParadigmServer:
    router = Router()
    SessionApi(presence, config.keepalive_seconds).register(router)
    return ParadigmServer((config.host, config.port), router, config.static_dir)


def wait_for_stop(presence: Presence, poll_seconds: float = STOP_POLL_SECONDS) -> None:
    # A short sleep loop rather than a blocking wait, so Ctrl-C works on Windows too.
    while not presence.should_stop():
        time.sleep(poll_seconds)


def _open_existing(config: Config, open_url: OpenUrl) -> bool:
    state = probe(config.host, config.port)
    if state is PortState.PARADIGM:
        log.info("Paradigm is already running at %s", config.url)
        if config.open_browser:
            open_url(config.url)
        return True
    if state is PortState.OTHER:
        raise LaunchError(
            "Port {} is in use by another program. Start Paradigm on another port: "
            "python paradigm.py --port 8766".format(config.port)
        )
    return False


def _pause_if_double_clicked() -> None:
    """Keep a double-clicked console window open long enough to read the error."""
    if os.name != "nt" or not sys.stdin or not sys.stdin.isatty():
        return
    try:
        input("Press Enter to close...")
    except (EOFError, KeyboardInterrupt):
        pass
