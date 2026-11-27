"""Builds sample Outlook messages (.msg) for tests: a small compound-file (MS-CFB, version 3)
writer and the few MS-OXMSG streams the reader looks at. Every sender and subject is made up
(Acme, Northwind); no real email is ever committed."""
import struct
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional

SECTOR = 512
MINI = 64
CUTOFF = 4096
END, FREE, FAT_SECTOR = 0xFFFFFFFE, 0xFFFFFFFF, 0xFFFFFFFD
NO_STREAM = 0xFFFFFFFF
_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")
_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)

FatPatch = Callable[[List[int], Dict[str, int]], None]


def compound_file(streams: Dict[str, bytes], fat_patch: Optional[FatPatch] = None,
                  mini_fat_patch: Optional[FatPatch] = None) -> bytes:
    """A compound file holding the streams in its root storage. The patches may change the FAT
    or mini FAT (given each stream's first sector, by name) before it is written, to break it."""
    names = list(streams)
    small = [name for name in names if len(streams[name]) < CUTOFF]
    big = [name for name in names if len(streams[name]) >= CUTOFF]

    mini_fat: List[int] = []
    mini_data = b""
    mini_starts: Dict[str, int] = {}
    for name in small:
        data = streams[name]
        count = -(-len(data) // MINI)
        if count == 0:
            mini_starts[name] = END
            continue
        first = len(mini_fat)
        mini_starts[name] = first
        mini_fat.extend(first + i + 1 for i in range(count - 1))
        mini_fat.append(END)
        mini_data += data + b"\x00" * (count * MINI - len(data))
    if mini_fat_patch:
        mini_fat_patch(mini_fat, mini_starts)

    entries = 1 + len(names)
    dir_sectors = -(-entries * 128 // SECTOR)
    mini_fat_bytes = b"".join(struct.pack("<I", value) for value in mini_fat)
    mini_fat_sectors = -(-len(mini_fat_bytes) // SECTOR)
    mini_stream_sectors = -(-len(mini_data) // SECTOR)
    big_sectors = {name: -(-len(streams[name]) // SECTOR) for name in big}
    used = dir_sectors + mini_fat_sectors + mini_stream_sectors + sum(big_sectors.values())
    fat_sectors = 1
    while -(-(used + fat_sectors) // (SECTOR // 4)) > fat_sectors:
        fat_sectors += 1

    fat: List[int] = []
    starts: Dict[str, int] = {}

    def run(count: int) -> int:
        if count == 0:
            return END
        first = len(fat)
        fat.extend(first + i + 1 for i in range(count - 1))
        fat.append(END)
        return first

    dir_start = run(dir_sectors)
    mini_fat_start = run(mini_fat_sectors)
    mini_stream_start = run(mini_stream_sectors)
    for name in big:
        starts[name] = run(big_sectors[name])
    fat_first = len(fat)
    fat.extend([FAT_SECTOR] * fat_sectors)
    fat.extend([FREE] * (fat_sectors * SECTOR // 4 - len(fat)))
    if fat_patch:
        fat_patch(fat, starts)

    directory = _entry("Root Entry", 5, mini_stream_start, len(mini_data), child=1 if names else NO_STREAM)
    for index, name in enumerate(names, 1):
        start = mini_starts[name] if name in mini_starts else starts[name]
        # A tree of right siblings only: valid, and enough for a reader that walks it all.
        right = index + 1 if index < len(names) else NO_STREAM
        directory += _entry(name, 2, start, len(streams[name]), right=right)
    body = (_pad(directory, dir_sectors) + _pad(mini_fat_bytes, mini_fat_sectors) + _pad(mini_data, mini_stream_sectors)
            + b"".join(_pad(streams[name], big_sectors[name]) for name in big)
            + _pad(b"".join(struct.pack("<I", value) for value in fat), fat_sectors))
    difat = list(range(fat_first, fat_first + fat_sectors)) + [FREE] * (109 - fat_sectors)
    header = (_SIGNATURE + b"\x00" * 16 + struct.pack("<HHHHH", 0x3E, 3, 0xFFFE, 9, 6) + b"\x00" * 6
              + struct.pack("<IIIIIIIII", 0, fat_sectors, dir_start, 0, CUTOFF, mini_fat_start
                            if mini_fat_sectors else END, mini_fat_sectors, END, 0)
              + b"".join(struct.pack("<I", value) for value in difat))
    assert len(header) == SECTOR
    return header + body


def _pad(data: bytes, sectors: int) -> bytes:
    return data + b"\x00" * (sectors * SECTOR - len(data))


def _entry(name: str, kind: int, start: int, size: int, child: int = NO_STREAM, right: int = NO_STREAM) -> bytes:
    raw = (name + "\x00").encode("utf-16-le")
    return (raw + b"\x00" * (64 - len(raw)) + struct.pack("<HBB", len(raw), kind, 1)
            + struct.pack("<III", NO_STREAM, right, child) + b"\x00" * 16 + b"\x00" * 4 + b"\x00" * 16
            + struct.pack("<IQ", start, size))


def filetime(when: datetime) -> int:
    return int((when - _EPOCH).total_seconds() * 10_000_000)


def properties(times: Dict[int, datetime], padding_entries: int = 0) -> bytes:
    """A top-level message's __properties_version1.0: its 32-byte header, then each time as a
    PT_SYSTIME entry, then padding_entries PT_LONG entries (to make the stream big)."""
    out = b"\x00" * 32
    for prop, when in times.items():
        out += struct.pack("<IIQ", (prop << 16) | 0x0040, 2, filetime(when))
    for index in range(padding_entries):
        out += struct.pack("<IIQ", ((0x6000 + index % 0x1000) << 16) | 0x0003, 2, index)
    return out


SUBMIT, DELIVERY = 0x0039, 0x0E06


def sample_msg(subject: str = "Acme rollout plan", sender: str = "Pat Northwind",
               sender_email: str = "pat@northwind.example", sent: Optional[datetime] = None,
               delivered: Optional[datetime] = None, unicode: bool = True, padding_entries: int = 0,
               with_subject: bool = True, **patches) -> bytes:
    """A made-up message. sent: its submit time; delivered: its delivery time (either may be None)."""
    kind = "001F" if unicode else "001E"

    def text(value: str) -> bytes:
        return value.encode("utf-16-le") if unicode else value.encode("cp1252")

    streams: Dict[str, bytes] = {}
    if with_subject:
        streams["__substg1.0_0037" + kind] = text(subject)
    streams["__substg1.0_0C1A" + kind] = text(sender)
    streams["__substg1.0_5D01" + kind] = text(sender_email)
    times = {}
    if sent is not None:
        times[SUBMIT] = sent
    if delivered is not None:
        times[DELIVERY] = delivered
    streams["__properties_version1.0"] = properties(times, padding_entries)
    return compound_file(streams, **patches)
