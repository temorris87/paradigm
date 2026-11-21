"""Launch settings: defaults plus command-line overrides."""
import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

DEFAULT_HOST = "127.0.0.1"
# A fixed port gives the app a stable address: the browser keeps local storage per
# address, and a second launch finds the first one there.
DEFAULT_PORT = 8765
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


def default_data_dir() -> Path:
    return Path.home() / "paradigm-notes"


@dataclass(frozen=True)
class Config:
    data_dir: Path
    static_dir: Path = STATIC_DIR
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    open_browser: bool = True
    # After the last tab closes, wait this long for a reload to reconnect before stopping.
    grace_seconds: float = 10.0
    # How often an open event stream is sent a keep-alive comment.
    keepalive_seconds: float = 15.0

    @property
    def url(self) -> str:
        return "http://{}:{}/".format(self.host, self.port)


def parse_args(argv: Optional[List[str]] = None) -> Config:
    parser = argparse.ArgumentParser(
        prog="paradigm", description="Start Paradigm and open it in the browser."
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="port to serve on (default %(default)s)")
    parser.add_argument("--data", type=Path, default=None,
                        help="data folder (default ~/paradigm-notes)")
    parser.add_argument("--no-browser", action="store_true",
                        help="start the server without opening a browser tab")
    args = parser.parse_args(argv)
    data_dir = args.data.expanduser() if args.data else default_data_dir()
    return Config(data_dir=data_dir, port=args.port, open_browser=not args.no_browser)
