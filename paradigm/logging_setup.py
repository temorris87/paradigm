"""Logging to the console (short messages, when there is a console) and to <data>/paradigm.log
(everything)."""
import logging
import logging.handlers
from pathlib import Path

LOG_NAME = "paradigm.log"


def setup_logging(data_dir: Path, console: bool = True) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = data_dir / LOG_NAME

    root = logging.getLogger("paradigm")
    root.setLevel(logging.DEBUG)
    root.handlers.clear()

    if console:
        stream = logging.StreamHandler()
        stream.setLevel(logging.INFO)
        stream.setFormatter(logging.Formatter("%(message)s"))
        root.addHandler(stream)

    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=1_000_000, backupCount=1, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    root.addHandler(file_handler)
    return log_path


def close_logging() -> None:
    """Close the handlers, releasing the log file (Windows cannot delete an open file)."""
    root = logging.getLogger("paradigm")
    for handler in root.handlers:
        handler.close()
    root.handlers.clear()
