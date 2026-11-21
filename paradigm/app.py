"""Startup and shutdown: reuse a running Paradigm or start one, open the browser, stop when told."""
import errno
import logging
import time
import webbrowser
from typing import Callable, List, Optional

from paradigm.api.session import SessionApi
from paradigm.config import Config, parse_args
from paradigm.instance import PortState, probe
from paradigm.logging_setup import setup_logging
from paradigm.notify import pause_console, show_error_box
from paradigm.presence import Presence
from paradigm.web.router import Router
from paradigm.web.server import ParadigmServer

log = logging.getLogger("paradigm")

OpenUrl = Callable[[str], object]
STOP_POLL_SECONDS = 0.25


class LaunchError(Exception):
    """A problem to explain to the user in plain words, without a traceback."""


def main(argv: Optional[List[str]] = None, console: bool = True) -> int:
    """Start Paradigm. console=False: no console window (paradigm.pyw), errors in a message box."""
    config = parse_args(argv)
    try:
        log_path = setup_logging(config.data_dir, console=console)
    except OSError as error:
        message = "Paradigm could not use its data folder {}: {}".format(config.data_dir, error)
        return _fail(message, console, printed=False)
    try:
        return run(config)
    except LaunchError as error:
        log.error("%s", error)
        message = str(error)
    except Exception:
        log.exception("Paradigm stopped with an error")
        message = "Paradigm stopped with an error. The details are in {}".format(log_path)
    return _fail(message, console, printed=True)


def _fail(message: str, console: bool, printed: bool) -> int:
    if not console:
        show_error_box(message)
        return 1
    if not printed:
        print(message)
    pause_console()
    return 1


def run(config: Config, open_url: OpenUrl = webbrowser.open,
        probe_port: Callable[[str, int], PortState] = probe) -> int:
    # Take the port first and only ask "is that a Paradigm?" if it is taken. Asking an
    # empty port first is slow on Windows: a refused local connection takes about 2 s.
    presence = Presence(config.grace_seconds)
    try:
        server = build_server(config, presence)
    except OSError as error:
        log.debug("could not bind %s:%s: %r", config.host, config.port, error)
        if probe_port(config.host, config.port) is PortState.PARADIGM:
            log.info("Paradigm is already running at %s", config.url)
            if config.open_browser:
                open_url(config.url)
            return 0
        raise LaunchError(port_error_message(config.port, error))
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
    SessionApi(presence, config.keepalive_seconds, config.max_streams).register(router)
    return ParadigmServer((config.host, config.port), router, config.static_dir)


def wait_for_stop(presence: Presence, poll_seconds: float = STOP_POLL_SECONDS) -> None:
    # A short sleep loop rather than a blocking wait, so Ctrl-C works on Windows too.
    while not presence.should_stop():
        time.sleep(poll_seconds)


# "Address in use" on Windows / Linux / Mac, and "access denied" on Windows / POSIX.
_IN_USE = {10048, errno.EADDRINUSE}
_DENIED = {10013, errno.EACCES}


def port_error_message(port: int, error: OSError) -> str:
    code = getattr(error, "winerror", None) or error.errno
    retry = "Try another port: python paradigm.py --port 9876"
    if code in _IN_USE:
        return "Port {} is in use by another program. {}".format(port, retry)
    if code in _DENIED:
        return (
            "The system would not let Paradigm use port {} (it may be reserved or blocked). "
            "{}. On Windows, reserved ports are listed by: "
            "netsh interface ipv4 show excludedportrange protocol=tcp".format(port, retry)
        )
    return "Paradigm could not use port {} ({}). {}".format(port, error, retry)
