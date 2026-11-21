import tempfile
import unittest
from pathlib import Path

from image_samples import gif_header, png
from paradigm.db.connection import Database
from paradigm.db.images_repo import BadImage, ImageRepository, NotFound, linked_image_ids
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository


class ImageRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.images = ImageRepository(self.db, clock=lambda: "2026-01-01T00:00:00Z")
        self.note = self.notes.create(None, "Acme")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def test_add_then_get_the_same_bytes(self) -> None:
        data = png(4, 3)
        added = self.images.add(self.note["id"], data)
        self.assertEqual((added["mime"], added["width"], added["height"], added["size"]),
                         ("image/png", 4, 3, len(data)))
        self.assertEqual(added["url"], "/api/image?id={}".format(added["id"]))
        stored = self.images.get(added["id"])
        self.assertEqual((stored.mime, stored.data), ("image/png", data))

    def test_the_same_bytes_in_the_same_note_are_stored_once(self) -> None:
        first = self.images.add(self.note["id"], png(4, 3))
        again = self.images.add(self.note["id"], png(4, 3))
        other = self.images.add(self.note["id"], png(5, 3))
        self.assertEqual(first["id"], again["id"])
        self.assertNotEqual(first["id"], other["id"])

    def test_another_note_gets_its_own_row(self) -> None:
        second = self.notes.create(None, "Northwind")
        self.assertNotEqual(self.images.add(self.note["id"], png(2, 2))["id"],
                            self.images.add(second["id"], png(2, 2))["id"])

    def test_the_type_comes_from_the_bytes(self) -> None:
        self.assertEqual(self.images.add(self.note["id"], gif_header(9, 9))["mime"], "image/gif")
        with self.assertRaises(BadImage):
            self.images.add(self.note["id"], b"<svg></svg>")

    def test_the_note_must_be_live(self) -> None:
        with self.assertRaises(NotFound):
            self.images.add(999, png(1, 1))
        other = self.notes.create(None, "Contoso")
        self.notes.delete(other["id"])
        with self.assertRaises(NotFound):
            self.images.add(other["id"], png(1, 1))

    def test_an_image_stays_when_its_note_is_deleted(self) -> None:
        other = self.notes.create(None, "Contoso")
        added = self.images.add(other["id"], png(1, 1))
        self.notes.delete(other["id"])
        self.assertEqual(self.images.get(added["id"]).mime, "image/png")

    def sweep(self) -> int:
        return self.images.sweep_unused(self.notes.all_bodies)

    def link(self, image) -> str:
        return "![shot]({})".format(image["url"])

    def save(self, note, body) -> None:
        current = self.notes.get(note["id"])
        self.notes.save(note["id"], body, current["version"])

    def exists(self, image) -> bool:
        try:
            self.images.get(image["id"])
            return True
        except NotFound:
            return False

    def test_an_image_whose_last_link_is_gone_is_deleted(self) -> None:
        image = self.images.add(self.note["id"], png(2, 2))
        self.save(self.note, "text " + self.link(image))
        self.assertEqual(self.sweep(), 0)
        self.save(self.note, "text")
        self.assertEqual(self.sweep(), 1)
        self.assertFalse(self.exists(image))
        self.assertEqual(self.sweep(), 0)

    def test_one_link_left_anywhere_keeps_the_image(self) -> None:
        image = self.images.add(self.note["id"], png(2, 2))
        other = self.notes.create(None, "Northwind", "copied: " + self.link(image))
        self.save(self.note, self.link(image) + "\n" + self.link(image))
        self.save(self.note, self.link(image))  # one of two links deleted
        self.assertEqual(self.sweep(), 0)
        self.save(self.note, "")  # the link in this note is gone, the other note still has one
        self.assertEqual(self.sweep(), 0)
        self.save(other, "")
        self.assertEqual(self.sweep(), 1)

    def test_a_trashed_note_keeps_its_images(self) -> None:
        other = self.notes.create(None, "Contoso")
        image = self.images.add(other["id"], png(2, 2))
        self.save(other, self.link(image))
        self.notes.delete(other["id"])
        self.assertEqual(self.sweep(), 0)
        self.assertTrue(self.exists(image))

    def test_ids_are_matched_whole(self) -> None:
        added = [self.images.add(self.note["id"], png(width, 1)) for width in range(1, 13)]
        one, twelve = added[0], added[11]
        self.assertEqual((one["id"], twelve["id"]), (1, 12))
        self.save(self.note, '![a](/api/image?id=12 "title") and more')
        self.assertEqual(self.sweep(), 11)
        self.assertTrue(self.exists(twelve))
        self.assertFalse(self.exists(one))

    def test_linked_image_ids(self) -> None:
        texts = ["![a](/api/image?id=3)", "x /api/image?id=40) /api/image?id=", "![b](/api/image?id=3 'c')"]
        self.assertEqual(linked_image_ids(texts), {3, 40})

    def test_unknown_image(self) -> None:
        with self.assertRaises(NotFound):
            self.images.get(12345)


if __name__ == "__main__":
    unittest.main()
