"""Turning a JSON handler's result, or one of its expected errors, into the response."""
from http.server import BaseHTTPRequestHandler
from typing import Callable, Dict, Type

from paradigm.web.responses import send_error_json, send_json

Handler = Callable[[BaseHTTPRequestHandler], Dict]
Route = Callable[[BaseHTTPRequestHandler], None]


def answering(statuses: Dict[Type[Exception], int]) -> Callable[[Handler], Route]:
    """A wrapper for handlers: their result is sent with 200; an error of a kind in statuses
    is sent as {error} with its status (the first kind it is an instance of). Any other
    error is a bug and propagates."""
    expected = tuple(statuses)

    def wrap(handler: Handler) -> Route:
        def route(req: BaseHTTPRequestHandler) -> None:
            try:
                result = handler(req)
            except expected as error:
                status = next(code for kind, code in statuses.items() if isinstance(error, kind))
                send_error_json(req, status, str(error))
                return
            send_json(req, 200, result)
        return route
    return wrap
