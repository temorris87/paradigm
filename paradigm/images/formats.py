"""Which kind of image some bytes are, and how big, read from the file's own header.

Only PNG, JPEG, GIF and WebP pass. SVG never does: it is a document that can carry scripts,
and served from our origin it could act as the app. The browser's Content-Type is never
trusted; these magic bytes decide what we store and what type we serve it as.
"""
import struct
from typing import NamedTuple


class BadImage(ValueError):
    pass


class ImageInfo(NamedTuple):
    mime: str
    width: int
    height: int


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# JPEG markers that are a frame header (SOFn) and so hold the size; C4, C8 and CC are not.
_SOF_MARKERS = set(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}
# Markers with no length field after them.
_STANDALONE = set(range(0xD0, 0xDA)) | {0x01}


def identify(data: bytes) -> ImageInfo:
    """The type and size of an image, or BadImage if it is not one we accept."""
    if data.startswith(PNG_SIGNATURE):
        info = _png(data)
    elif data.startswith(b"\xff\xd8\xff"):
        info = _jpeg(data)
    elif data[:6] in (b"GIF87a", b"GIF89a"):
        info = _gif(data)
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        info = _webp(data)
    else:
        raise BadImage("not a PNG, JPEG, GIF or WebP image")
    if info.width <= 0 or info.height <= 0:
        raise BadImage("the image has no size")
    return info


def _png(data: bytes) -> ImageInfo:
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise BadImage("a broken PNG header")
    width, height = struct.unpack(">II", data[16:24])
    return ImageInfo("image/png", width, height)


def _gif(data: bytes) -> ImageInfo:
    if len(data) < 10:
        raise BadImage("a broken GIF header")
    width, height = struct.unpack("<HH", data[6:10])
    return ImageInfo("image/gif", width, height)


def _jpeg(data: bytes) -> ImageInfo:
    at = 2
    while at + 4 <= len(data):
        if data[at] != 0xFF:
            raise BadImage("a broken JPEG marker")
        marker = data[at + 1]
        if marker == 0xFF:  # fill byte before a marker
            at += 1
            continue
        if marker in _STANDALONE:
            at += 2
            continue
        (length,) = struct.unpack(">H", data[at + 2:at + 4])
        if length < 2:
            raise BadImage("a broken JPEG segment")
        if marker in _SOF_MARKERS:
            if at + 9 > len(data):
                break
            height, width = struct.unpack(">HH", data[at + 5:at + 9])
            return ImageInfo("image/jpeg", width, height)
        if marker == 0xDA:  # image data starts and no frame header came first
            break
        at += 2 + length
    raise BadImage("a JPEG with no frame header")


def _webp(data: bytes) -> ImageInfo:
    chunk = data[12:16]
    if chunk == b"VP8 " and len(data) >= 30 and data[23:26] == b"\x9d\x01\x2a":
        width, height = struct.unpack("<HH", data[26:30])
        return ImageInfo("image/webp", width & 0x3FFF, height & 0x3FFF)
    if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        (bits,) = struct.unpack("<I", data[21:25])
        return ImageInfo("image/webp", (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
    if chunk == b"VP8X" and len(data) >= 30:
        width = int.from_bytes(data[24:27], "little") + 1
        height = int.from_bytes(data[27:30], "little") + 1
        return ImageInfo("image/webp", width, height)
    raise BadImage("a broken WebP header")
