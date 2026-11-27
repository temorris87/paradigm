"""Reads an Outlook message (.msg): its subject, sender and sent time. Pure: bytes in, a small
dataclass out. No third-party reader is allowed at work, so this is our own.

A .msg is an OLE compound file (MS-CFB): a little FAT file system of fixed-size sectors. The
header lists the FAT's sectors (the first 109 in the header, the rest in a DIFAT chain); the
FAT chains the sectors of each stream; streams under 4096 bytes live in the mini stream, 64-byte
pieces chained by the mini FAT. The directory names the streams. The message's properties are
in streams of the root storage (MS-OXMSG): strings each in a "__substg1.0_<tag>" stream, fixed
values such as times in "__properties_version1.0".

Every chain is followed with a cap and a set of sectors seen, so a crafted file can't loop or
make us read more than it holds: anything wrong is a ValueError."""
import struct
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Dict, List, Optional

__all__ = ["MsgInfo", "read_msg", "MAX_BYTES"]

# Far beyond any email worth attaching; the upload is capped at 30 MB too.
MAX_BYTES = 30_000_000
MAX_DIRECTORY_ENTRIES = 20_000

_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")
_HEADER_SIZE = 512
_HEADER_DIFAT = 109
_FREE, _END, _FAT_SECTOR, _DIFAT_SECTOR = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD, 0xFFFFFFFC
_NO_STREAM = 0xFFFFFFFF
_STORAGE, _STREAM, _ROOT = 1, 2, 5
_ENTRY_SIZE = 128

_SUBJECT = "0037"
_SENDER_NAME = "0C1A"
_SENDER_EMAILS = ("5D01", "0C1F")  # PR_SENDER_SMTP_ADDRESS, else PR_SENDER_EMAIL_ADDRESS
_SUBMIT_TIME = 0x0039
_DELIVERY_TIME = 0x0E06
_PT_SYSTIME = 0x0040
_PROPERTIES = "__PROPERTIES_VERSION1.0"
# A top-level message's property stream starts with 32 bytes of counts before its entries.
_PROPERTIES_HEADER = 32
_FILETIME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)


@dataclass(frozen=True)
class MsgInfo:
    subject: str
    sender: str
    sender_email: str
    sent_at: Optional[str]  # local ISO time, to the second; None when the message has none


def read_msg(data: bytes, tz: Optional[tzinfo] = None) -> MsgInfo:
    """What the .msg says. tz: the zone sent_at is given in (None: this computer's)."""
    streams = _CompoundFile(data).root_streams()
    subject = _string(streams, _SUBJECT)
    if subject is None:
        raise ValueError("no subject stream: not an Outlook message")
    email = next((found for found in (_string(streams, tag) for tag in _SENDER_EMAILS) if found), "")
    return MsgInfo(subject=subject, sender=_string(streams, _SENDER_NAME) or "", sender_email=email,
                   sent_at=_sent_at(streams.get(_PROPERTIES), tz))


def _string(streams: Dict[str, bytes], tag: str) -> Optional[str]:
    """A string property: UTF-16LE (type 001F), else 8-bit (001E, Windows' cp1252)."""
    raw = streams.get("__SUBSTG1.0_{}001F".format(tag))
    if raw is not None:
        return raw.decode("utf-16-le", errors="replace").rstrip("\x00").strip()
    raw = streams.get("__SUBSTG1.0_{}001E".format(tag))
    if raw is not None:
        return raw.decode("cp1252", errors="replace").rstrip("\x00").strip()
    return None


def _sent_at(properties: Optional[bytes], tz: Optional[tzinfo]) -> Optional[str]:
    if not properties:
        return None
    times: Dict[int, int] = {}
    for offset in range(_PROPERTIES_HEADER, len(properties) - 15, 16):
        tag, _flags, value = struct.unpack_from("<IIQ", properties, offset)
        if tag & 0xFFFF == _PT_SYSTIME:
            times[tag >> 16] = value
    for prop in (_SUBMIT_TIME, _DELIVERY_TIME):
        when = _filetime(times.get(prop, 0))
        if when is not None:
            local = when.astimezone(tz) if tz is not None else when.astimezone()
            return local.replace(tzinfo=None).isoformat(timespec="seconds")
    return None


def _filetime(value: int) -> Optional[datetime]:
    """A FILETIME (100 ns ticks since 1601, UTC); None for 0 or a value no date can hold."""
    if value <= 0:
        return None
    try:
        return _FILETIME_EPOCH + timedelta(microseconds=value // 10)
    except OverflowError:
        return None


class _CompoundFile:
    def __init__(self, data: bytes):
        if len(data) > MAX_BYTES:
            raise ValueError("too large for an email")
        if len(data) < _HEADER_SIZE or data[:8] != _SIGNATURE:
            raise ValueError("not a compound file")
        self._data = data
        (sector_shift, mini_shift) = struct.unpack_from("<HH", data, 0x1E)
        if sector_shift not in (9, 12) or mini_shift != 6:
            raise ValueError("unknown sector size")
        self._sector_size = 1 << sector_shift
        self._mini_size = 1 << mini_shift
        (fat_count, self._directory_start, _transaction, self._cutoff, self._mini_fat_start, mini_fat_count,
         difat_start, difat_count) = struct.unpack_from("<IIIIIIII", data, 0x2C)
        self._sector_count = max(0, (len(data) - self._sector_size) // self._sector_size)
        if fat_count > self._sector_count or mini_fat_count > self._sector_count or difat_count > self._sector_count:
            raise ValueError("more sectors listed than the file holds: truncated")
        self._fat = self._read_fat(fat_count, difat_start, difat_count)
        self._mini_fat_count = mini_fat_count

    # ---- sectors and the FAT ----

    def _sector(self, number: int) -> bytes:
        if number >= self._sector_count:
            raise ValueError("sector {} is past the end: truncated or broken".format(number))
        start = (number + 1) * self._sector_size
        return self._data[start:start + self._sector_size]

    def _read_fat(self, fat_count: int, difat_start: int, difat_count: int) -> List[int]:
        fat_sectors = [n for n in struct.unpack_from("<{}I".format(_HEADER_DIFAT), self._data, 0x4C)]
        per_sector = self._sector_size // 4
        seen = set()
        sector = difat_start
        for _ in range(difat_count):
            if sector in (_END, _FREE) or sector in seen:
                raise ValueError("broken DIFAT chain")
            seen.add(sector)
            values = struct.unpack("<{}I".format(per_sector), self._sector(sector))
            fat_sectors.extend(values[:-1])
            sector = values[-1]
        fat: List[int] = []
        for number in fat_sectors[:fat_count]:
            if number in (_FREE, _END):
                raise ValueError("a FAT sector is missing")
            fat.extend(struct.unpack("<{}I".format(per_sector), self._sector(number)))
        return fat

    def _chain(self, start: int, table: List[int], limit: int) -> List[int]:
        """The sectors from start to the chain's end; ValueError on a loop or a bad link."""
        chain: List[int] = []
        seen = set()
        sector = start
        while sector != _END:
            if sector >= len(table) or sector in seen or len(chain) >= limit:
                raise ValueError("broken sector chain")
            seen.add(sector)
            chain.append(sector)
            sector = table[sector]
        return chain

    def _big_stream(self, start: int, size: Optional[int]) -> bytes:
        """A stream on the main FAT (size None: the whole chain, as for the directory)."""
        if size is not None and size == 0:
            return b""
        limit = self._sector_count if size is None else -(-size // self._sector_size)
        chain = self._chain(start, self._fat, limit)
        if size is not None and len(chain) * self._sector_size < size:
            raise ValueError("a stream is shorter than its size: truncated")
        data = b"".join(self._sector(number) for number in chain)
        return data if size is None else data[:size]

    # ---- the directory and the mini stream ----

    def _directory(self) -> List[bytes]:
        raw = self._big_stream(self._directory_start, None)
        count = min(len(raw) // _ENTRY_SIZE, MAX_DIRECTORY_ENTRIES)
        return [raw[i * _ENTRY_SIZE:(i + 1) * _ENTRY_SIZE] for i in range(count)]

    def root_streams(self) -> Dict[str, bytes]:
        """The streams directly in the root storage, by upper-case name."""
        entries = self._directory()
        if not entries or entries[0][66] != _ROOT:
            raise ValueError("no root entry")
        root = entries[0]
        mini_stream = self._big_stream(_start(root), _size(root))
        mini_fat = self._mini_fat()
        found: Dict[str, bytes] = {}
        for index in self._children(entries, _child(root)):
            entry = entries[index]
            if entry[66] != _STREAM:
                continue
            size = _size(entry)
            if size < self._cutoff:
                found[_name(entry).upper()] = self._mini_stream_read(mini_stream, mini_fat, _start(entry), size)
            else:
                found[_name(entry).upper()] = self._big_stream(_start(entry), size)
        return found

    def _mini_fat(self) -> List[int]:
        if self._mini_fat_count == 0 or self._mini_fat_start in (_END, _FREE):
            return []
        raw = self._big_stream(self._mini_fat_start, self._mini_fat_count * self._sector_size)
        return list(struct.unpack("<{}I".format(len(raw) // 4), raw))

    def _mini_stream_read(self, mini_stream: bytes, mini_fat: List[int], start: int, size: int) -> bytes:
        if size == 0:
            return b""
        chain = self._chain(start, mini_fat, -(-size // self._mini_size))
        pieces = []
        for number in chain:
            offset = number * self._mini_size
            if offset + self._mini_size > len(mini_stream):
                raise ValueError("a mini sector is past the mini stream's end")
            pieces.append(mini_stream[offset:offset + self._mini_size])
        data = b"".join(pieces)
        if len(data) < size:
            raise ValueError("a stream is shorter than its size: truncated")
        return data[:size]

    def _children(self, entries: List[bytes], first: int) -> List[int]:
        """A storage's children: the red-black tree under its child, walked with a set of
        entries seen so a crafted loop ends."""
        found: List[int] = []
        seen = set()
        stack = [first]
        while stack:
            index = stack.pop()
            if index == _NO_STREAM:
                continue
            if index >= len(entries) or index in seen:
                raise ValueError("broken directory tree")
            seen.add(index)
            found.append(index)
            left, right = struct.unpack_from("<II", entries[index], 68)
            stack.extend((left, right))
        return found


def _name(entry: bytes) -> str:
    (length,) = struct.unpack_from("<H", entry, 64)
    length = min(length, 64)
    return entry[:length].decode("utf-16-le", errors="replace").rstrip("\x00")


def _child(entry: bytes) -> int:
    return struct.unpack_from("<I", entry, 76)[0]


def _start(entry: bytes) -> int:
    return struct.unpack_from("<I", entry, 116)[0]


def _size(entry: bytes) -> int:
    # Version 3 files may hold junk in the high half; no stream of ours comes near 4 GB.
    return struct.unpack_from("<I", entry, 120)[0]
