"""Logging to the console (short messages) and to <data>/paradigm.log (everything)."""
import logging
import logging.handlers
from pathlib import Path

LOG_NAME = "paradigm.log"


def setup_logging(data_dir: Path) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = data_dir / LOG_NAME

    root = logging.getLogger("paradigm")
    root.setLevel(logging.DEBUG)
    root.handlers.clear()

    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(console)

    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=1_000_000, backupCount=1, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    root.addHandler(file_handler)
    return log_path
