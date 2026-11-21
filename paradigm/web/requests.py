"""Reading what a request sent."""
import json
from http.server import BaseHTTPRequestHandler
from typing import Any, Dict


class BadRequest(ValueError):
    """The request itself is wrong; the message is sent back with a 400."""


def read_json(req: BaseHTTPRequestHandler) -> Dict[str, Any]:
    """The body as a JSON object."""
    try:
        payload = json.loads(req.body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise BadRequest("the body is not JSON")
    if not isinstance(payload, dict):
        raise BadRequest("the body must be a JSON object")
    return payload


def int_field(payload: Dict[str, Any], name: str) -> int:
    value = payload.get(name)
    # bool is an int in Python; true is never a note id.
    if not isinstance(value, int) or isinstance(value, bool):
        raise BadRequest("{} must be a whole number".format(name))
    return value


def optional_int_field(payload: Dict[str, Any], name: str):
    return None if payload.get(name) is None else int_field(payload, name)


def str_field(payload: Dict[str, Any], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str):
        raise BadRequest("{} must be text".format(name))
    return value


def bool_field(payload: Dict[str, Any], name: str) -> bool:
    value = payload.get(name, False)
    if not isinstance(value, bool):
        raise BadRequest("{} must be true or false".format(name))
    return value
