"""Startup and shutdown: reuse a running Paradigm or start one, open the browser, stop when told."""
import errno
import logging
import time
import webbrowser
from typing import Callable, List, Optional

from paradigm.api.images import ImagesApi
from paradigm.api.links import LinksApi
from paradigm.api.meetings import MeetingsApi
from paradigm.api.notes import NotesApi
from paradigm.api.people import PeopleApi
from paradigm.api.records import RecordsApi
from paradigm.api.session import SessionApi
from paradigm.api.trash import TrashApi
from paradigm.config import Config, parse_args
from paradigm.db.connection import Database
from paradigm.db.images_repo import ImageRepository
from paradigm.db.links_repo import LinkRepository
from paradigm.db.migrate import SchemaTooNew, migrate
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.records_repo import RecordRepository
from paradigm.db.trash_repo import TrashRepository
from paradigm.instance import PortState, probe
from paradigm.logging_setup import setup_logging
from paradigm.notes.seed import seed_if_empty
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
        server = bind_server(config)
    except OSError as error:
        log.debug("could not bind %s:%s: %r", config.host, config.port, error)
        if probe_port(config.host, config.port) is PortState.PARADIGM:
            log.info("Paradigm is already running at %s", config.url)
            if config.open_browser:
                open_url(config.url)
            return 0
        raise LaunchError(port_error_message(config.port, error))
    install_apis(server, config, presence)
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
    server = bind_server(config)
    install_apis(server, config, presence)
    return server


def bind_server(config: Config) -> ParadigmServer:
    return ParadigmServer((config.host, config.port), Router(), config.static_dir)


def install_apis(server: ParadigmServer, config: Config, presence: Presence) -> None:
    """The database opens only once the port is ours, so a second launch never touches it."""
    try:
        db = open_database(config)
        server.on_close.append(db.close)
        notes = NoteRepository(db)
        images = ImageRepository(db)
        trash = TrashRepository(db, keep_days=config.trash_days)
        seed_if_empty(notes)
        empty_trash(trash)
        sweep_images(images, notes)
        # Whichever sweep deleted the images, this one or the one at the last stop (which
        # doesn't vacuum, so closing the last tab stays quick), the file shrinks here.
        if db.vacuum_if_worth_it():
            log.info("Database compacted")
    except BaseException:
        # Not server.stop(): it would wait for a serve loop that never started.
        server.server_close()
        for close in server.on_close:
            close()
        raise
    # Before the database closes. Only with no tab open: an open tab's undo could bring a
    # deleted link back (Ctrl-C stops the server with tabs still open).
    def tidy_at_stop() -> None:
        if presence.tab_count == 0:
            empty_trash(trash)
            sweep_images(images, notes)

    server.on_close.insert(0, tidy_at_stop)
    SessionApi(presence, config.keepalive_seconds, config.max_streams).register(server.router)
    NotesApi(notes).register(server.router)
    PeopleApi(PeopleRepository(db), notes).register(server.router)
    MeetingsApi(MeetingRepository(db), notes).register(server.router)
    RecordsApi(RecordRepository(db), notes).register(server.router)
    ImagesApi(images).register(server.router)
    LinksApi(LinkRepository(db)).register(server.router)
    TrashApi(trash, notes).register(server.router)


def empty_trash(trash: TrashRepository) -> int:
    """Deletes for good the notes trashed over a week ago (before the image sweep, so their
    images can go too). A failure is logged, never fatal: they only wait for the next time."""
    try:
        removed = trash.purge()
    except Exception:
        log.exception("could not empty the trash")
        return 0
    if removed:
        log.info("Deleted %d note%s for good (in the Trash for over %d days)", removed, "" if removed == 1 else "s",
                 trash.keep_days)
    return removed


def sweep_images(images: ImageRepository, notes: NoteRepository) -> int:
    """Deletes images no note links to. A failure is logged, never fatal: it only costs space."""
    try:
        removed = images.sweep_unused(notes.all_bodies)
    except Exception:
        log.exception("could not remove unused images")
        return 0
    if removed:
        log.info("Removed %d unused image%s", removed, "" if removed == 1 else "s")
    return removed


def open_database(config: Config) -> Database:
    db = Database.in_folder(config.data_dir)
    try:
        migrate(db)
    except SchemaTooNew as error:
        db.close()
        raise LaunchError(str(error))
    except BaseException:
        db.close()
        raise
    return db


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
