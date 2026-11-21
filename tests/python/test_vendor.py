"""Vendored libraries must be exactly the audited files (docs/security/vendor-audit.md)."""
import hashlib
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MANIFESTS = REPO / "docs" / "security"
VENDOR = REPO / "static" / "vendor"

# Each vendored folder and the manifest it was audited against.
VENDORED = {"katex-0.19.1": "katex-0.19.1.sha256", "mermaid-12.3.0": "mermaid-12.3.0.sha256"}


def read_manifest(path: Path) -> dict:
    """sha256sum's format: "<hex>  <relative path>" per line."""
    entries = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            digest, name = line.split(maxsplit=1)
            entries[name.strip()] = digest
    return entries


class VendoredFilesTest(unittest.TestCase):
    def test_every_vendor_folder_has_a_manifest(self) -> None:
        folders = {path.name for path in VENDOR.iterdir() if path.is_dir()}
        self.assertEqual(folders, set(VENDORED))

    def test_files_match_their_manifest(self) -> None:
        for folder, manifest in VENDORED.items():
            root = VENDOR / folder
            expected = read_manifest(MANIFESTS / manifest)
            present = {path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()}
            with self.subTest(folder=folder):
                self.assertEqual(present, set(expected), "files added or missing")
            for name, digest in expected.items():
                with self.subTest(file=f"{folder}/{name}"):
                    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
                    self.assertEqual(actual, digest)


if __name__ == "__main__":
    unittest.main()
