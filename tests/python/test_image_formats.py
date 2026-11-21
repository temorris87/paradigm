import unittest

from image_samples import gif_header, jpeg_header, png, webp_extended, webp_lossless, webp_lossy
from paradigm.images.formats import BadImage, ImageInfo, identify


class IdentifyTest(unittest.TestCase):
    def test_each_accepted_type_with_its_size(self) -> None:
        cases = [
            (png(3, 2), ImageInfo("image/png", 3, 2)),
            (jpeg_header(1920, 1080), ImageInfo("image/jpeg", 1920, 1080)),
            (gif_header(640, 480), ImageInfo("image/gif", 640, 480)),
            (webp_lossy(800, 600), ImageInfo("image/webp", 800, 600)),
            (webp_lossless(16000, 2), ImageInfo("image/webp", 16000, 2)),
            (webp_extended(4000, 3000), ImageInfo("image/webp", 4000, 3000)),
        ]
        for data, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(identify(data), expected)

    def test_others_are_refused(self) -> None:
        cases = {
            "svg": b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "html": b"<!DOCTYPE html><p>hi",
            "empty": b"",
            "truncated png": png(3, 2)[:20],
            "truncated jpeg": jpeg_header(10, 10)[:12],
            "jpeg without frame": b"\xff\xd8\xff\xda\x00\x02",
            "zero size gif": gif_header(0, 5),
            "broken webp": b"RIFF\x00\x00\x00\x00WEBPVP8 \x00",
            "bmp": b"BM" + b"\x00" * 40,
        }
        for name, data in cases.items():
            with self.subTest(name), self.assertRaises(BadImage):
                identify(data)


if __name__ == "__main__":
    unittest.main()
