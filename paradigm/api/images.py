"""Endpoints for images.

POST /api/image/upload?note=N   the raw image bytes as the body -> {id, url, mime, width, height, size}
GET  /api/image?id=N            the image, cached for good: an id's bytes never change
"""
from http.server import BaseHTTPRequestHandler

from paradigm.db.images_repo import BadImage, ImageRepository, NotFound
from paradigm.web.requests import BadRequest
from paradigm.web.responses import send_bytes, send_error_json, send_json
from paradigm.web.router import Router

# private: only this browser keeps it. immutable: no revalidation while scrolling a note.
IMAGE_CACHE = "private, max-age=31536000, immutable"


class ImagesApi:
    def __init__(self, images: ImageRepository):
        self._images = images

    def register(self, router: Router) -> None:
        router.add("POST", "/api/image/upload", self.upload)
        router.add("GET", "/api/image", self.get)
        router.add("HEAD", "/api/image", self.get)

    def upload(self, req: BaseHTTPRequestHandler) -> None:
        try:
            note_id = _id_param(req, "note")
            if not req.body:
                raise BadRequest("the body must be the image")
            send_json(req, 200, self._images.add(note_id, req.body))
        except NotFound as error:
            send_error_json(req, 404, str(error))
        except (BadImage, BadRequest) as error:
            send_error_json(req, 400, str(error))

    def get(self, req: BaseHTTPRequestHandler) -> None:
        try:
            image = self._images.get(_id_param(req, "id"))
        except NotFound as error:
            send_error_json(req, 404, str(error))
        except BadRequest as error:
            send_error_json(req, 400, str(error))
        else:
            send_bytes(req, 200, image.data, image.mime, cache=IMAGE_CACHE,
                       extra_headers=(("Content-Disposition", "inline"),))


def _id_param(req: BaseHTTPRequestHandler, name: str) -> int:
    raw = req.query.get(name, "")
    if not raw.isdigit():
        raise BadRequest("{} must be a whole number".format(name))
    return int(raw)
