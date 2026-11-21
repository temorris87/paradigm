"""Find out what is listening on Paradigm's port: a running Paradigm, something else, or nothing."""
import json
import urllib.error
import urllib.request
from enum import Enum


class PortState(Enum):
    FREE = "free"
    PARADIGM = "paradigm"
    OTHER = "other"


# Never route the local check through a proxy: work PCs often have one configured.
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def probe(host: str, port: int, timeout: float = 1.0) -> PortState:
    url = "http://{}:{}/api/ping".format(host, port)
    try:
        with _opener.open(url, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error.close()
        return PortState.OTHER
    except urllib.error.URLError as error:
        if isinstance(error.reason, ConnectionRefusedError):
            return PortState.FREE
        return PortState.OTHER
    except ConnectionRefusedError:
        return PortState.FREE
    except (OSError, ValueError):
        return PortState.OTHER
    if isinstance(payload, dict) and payload.get("app") == "paradigm":
        return PortState.PARADIGM
    return PortState.OTHER
