"""Our own .msg reader: subject, sender and sent time out of an OLE compound file, and every
broken file refused with ValueError, fast."""
import struct
import time
import unittest
from datetime import datetime, timedelta, timezone

from msg_fixture import DELIVERY, SUBMIT, compound_file, properties, sample_msg
from paradigm.files.msg_reader import read_msg

UTC = timezone.utc
SENT = datetime(2026, 11, 20, 14, 30, 5, tzinfo=UTC)


class MsgReaderTest(unittest.TestCase):
    def test_a_unicode_message(self) -> None:
        info = read_msg(sample_msg(subject="Northwind – Q4 résumé ✉", sent=SENT), tz=UTC)
        self.assertEqual(info.subject, "Northwind – Q4 résumé ✉")
        self.assertEqual(info.sender, "Pat Northwind")
        self.assertEqual(info.sender_email, "pat@northwind.example")
        self.assertEqual(info.sent_at, "2026-11-20T14:30:05")

    def test_an_8_bit_message(self) -> None:
        info = read_msg(sample_msg(subject="Acme café order", unicode=False, sent=SENT), tz=UTC)
        self.assertEqual(info.subject, "Acme café order")
        self.assertEqual(info.sender, "Pat Northwind")

    def test_the_sent_time_is_given_in_the_zone_asked(self) -> None:
        five_east = timezone(timedelta(hours=5))
        self.assertEqual(read_msg(sample_msg(sent=SENT), tz=five_east).sent_at, "2026-11-20T19:30:05")
        # No zone given: this computer's.
        self.assertEqual(read_msg(sample_msg(sent=SENT)).sent_at,
                         SENT.astimezone().replace(tzinfo=None).isoformat(timespec="seconds"))

    def test_the_delivery_time_stands_in_for_the_submit_time(self) -> None:
        delivered = SENT + timedelta(minutes=3)
        self.assertEqual(read_msg(sample_msg(delivered=delivered), tz=UTC).sent_at, "2026-11-20T14:33:05")
        both = read_msg(sample_msg(sent=SENT, delivered=delivered), tz=UTC)
        self.assertEqual(both.sent_at, "2026-11-20T14:30:05")
        self.assertIsNone(read_msg(sample_msg(), tz=UTC).sent_at)

    def test_the_smtp_address_comes_first_then_the_email_address(self) -> None:
        streams = {"__substg1.0_0037001F": "Hi".encode("utf-16-le"),
                   "__substg1.0_0C1F001F": "old@acme.example".encode("utf-16-le")}
        self.assertEqual(read_msg(compound_file(streams)).sender_email, "old@acme.example")
        streams["__substg1.0_5D01001F"] = "pat@acme.example".encode("utf-16-le")
        self.assertEqual(read_msg(compound_file(streams)).sender_email, "pat@acme.example")
        self.assertEqual(read_msg(compound_file(streams)).sender, "")

    def test_large_streams_on_the_main_fat(self) -> None:
        # Over 4096 bytes: the subject and the properties are on the main FAT, not the mini stream.
        long_subject = "Acme quarterly review " * 200
        data = sample_msg(subject=long_subject, sent=SENT, padding_entries=400)
        self.assertGreater(len(properties({SUBMIT: SENT}, 400)), 4096)
        info = read_msg(data, tz=UTC)
        self.assertEqual(info.subject, long_subject.strip())
        self.assertEqual(info.sent_at, "2026-11-20T14:30:05")

    def test_a_message_of_many_fat_sectors(self) -> None:
        big = {"__substg1.0_0037001F": "Big".encode("utf-16-le"), "__substg1.0_1000001F": b"x" * 200_000,
               "__properties_version1.0": properties({DELIVERY: SENT})}
        self.assertEqual(read_msg(compound_file(big), tz=UTC).sent_at, "2026-11-20T14:30:05")

    def test_refused_files(self) -> None:
        good = sample_msg(sent=SENT)
        cases = {
            "empty": b"",
            "a png": b"\x89PNG\r\n\x1a\n" + b"\x00" * 600,
            "text": b"Subject: hi\r\n" * 100,
            "only a header": good[:512],
            "truncated": good[:len(good) // 2],
            "no subject stream": sample_msg(with_subject=False, sent=SENT),
        }
        for label, data in cases.items():
            with self.subTest(label):
                with self.assertRaises(ValueError):
                    read_msg(data)

    def test_broken_chains_are_refused_fast(self) -> None:
        name = "__substg1.0_1000001F"
        streams = {"__substg1.0_0037001F": "Loop".encode("utf-16-le"), name: b"y" * 50_000}

        def loop(fat, starts):
            fat[starts[name] + 5] = starts[name]

        def out_of_range(fat, starts):
            fat[starts[name] + 5] = 0x00FFFFFF

        def ends_early(fat, starts):
            fat[starts[name] + 5] = 0xFFFFFFFE

        def mini_loop(mini_fat, starts):
            first = starts["__substg1.0_0037001F"]
            mini_fat[first] = first

        cases = {"loop": compound_file(streams, fat_patch=loop),
                 "out of range": compound_file(streams, fat_patch=out_of_range),
                 "ends early": compound_file(streams, fat_patch=ends_early),
                 "mini loop": compound_file({"__substg1.0_0037001F": b"a\x00" * 100}, mini_fat_patch=mini_loop)}
        for label, data in cases.items():
            with self.subTest(label):
                started = time.monotonic()
                with self.assertRaises(ValueError):
                    read_msg(data)
                self.assertLess(time.monotonic() - started, 1.0)

    def test_a_looping_directory_tree_is_refused(self) -> None:
        data = bytearray(sample_msg(sent=SENT))
        directory_start = struct.unpack_from("<I", data, 0x30)[0]
        entry_one = (directory_start + 1) * 512 + 128
        # Entry 1's right sibling points back at itself.
        struct.pack_into("<I", data, entry_one + 72, 1)
        with self.assertRaises(ValueError):
            read_msg(bytes(data))

    def test_a_header_claiming_huge_counts_is_refused(self) -> None:
        data = bytearray(sample_msg(sent=SENT))
        struct.pack_into("<I", data, 0x2C, 0x7FFFFFFF)
        with self.assertRaises(ValueError):
            read_msg(bytes(data))
        data = bytearray(sample_msg(sent=SENT))
        struct.pack_into("<II", data, 0x44, 0, 0x7FFFFFFF)
        with self.assertRaises(ValueError):
            read_msg(bytes(data))


if __name__ == "__main__":
    unittest.main()
