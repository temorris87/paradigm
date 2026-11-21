"""Every read and write of images. The only code that knows the images table."""
import hashlib
import re
from typing import Callable, Dict, Iterable, NamedTuple, Set

from paradigm.db.connection import Database
from paradigm.db.notes_repo import Clock, NotFound, utc_now
from paradigm.images.formats import BadImage, identify

__all__ = ["ImageRepository", "StoredImage", "BadImage", "NotFound", "image_url", "linked_image_ids"]

# A link to an image anywhere in a note's text. (?!\d): id=1 is not a link to id=12.
_IMAGE_LINK = re.compile(r"/api/image\?id=(\d+)(?!\d)")


class StoredImage(NamedTuple):
    mime: str
    data: bytes


def image_url(image_id: int) -> str:
    """How a note links to an image. :export looks for this form too."""
    return "/api/image?id={:d}".format(image_id)


def linked_image_ids(texts: Iterable[str]) -> Set[int]:
    """The ids of every image the texts link to."""
    return {int(found) for text in texts for found in _IMAGE_LINK.findall(text)}


class ImageRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def sweep_unused(self, bodies: Callable[[], Iterable[str]]) -> int:
        """Deletes every image no note links to any more; returns how many went.

        Runs only when no tab is open (at start and stop): while a note is open, an undo or a
        put can bring a deleted link back, and its image must still be there.
        """
        with self._db.transaction() as conn:
            linked = linked_image_ids(bodies())
            stored = [row[0] for row in conn.execute("SELECT id FROM images").fetchall()]
            unused = [image_id for image_id in stored if image_id not in linked]
            conn.executemany("DELETE FROM images WHERE id = ?", [(image_id,) for image_id in unused])
        return len(unused)

    def add(self, note_id: int, data: bytes) -> Dict:
        """Stores the image under a live note; the same bytes again return the first row."""
        info = identify(data)
        digest = hashlib.sha256(data).hexdigest()
        with self._db.transaction() as conn:
            note = conn.execute("SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL",
                                (note_id,)).fetchone()
            if note is None:
                raise NotFound("No such note: {}".format(note_id))
            row = conn.execute("SELECT id FROM images WHERE note_id = ? AND sha256 = ?",
                               (note_id, digest)).fetchone()
            if row is None:
                cursor = conn.execute(
                    "INSERT INTO images (note_id, mime, width, height, size, sha256, data, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (note_id, info.mime, info.width, info.height, len(data), digest, data, self._clock()),
                )
                image_id = cursor.lastrowid
            else:
                image_id = row["id"]
        return {"id": image_id, "url": image_url(image_id), "mime": info.mime,
                "width": info.width, "height": info.height, "size": len(data)}

    def get(self, image_id: int) -> StoredImage:
        with self._db.reading() as conn:
            row = conn.execute("SELECT mime, data FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            raise NotFound("No such image: {}".format(image_id))
        return StoredImage(row["mime"], bytes(row["data"]))
