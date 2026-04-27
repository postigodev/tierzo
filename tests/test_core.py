from __future__ import annotations

import json
import unittest
import uuid
from pathlib import Path

from tierzo.export import generate_pack, zip_pack
from tierzo.filenames import image_filename, slugify
from tierzo.parsers import parse_csv_file, parse_text_lines
from tierzo.presets import get_preset


TMP_ROOT = Path(".tierzo") / "test-tmp"


def temporary_workspace() -> Path:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    path = TMP_ROOT / uuid.uuid4().hex
    path.mkdir()
    return path


class TierzoCoreTests(unittest.TestCase):
    def test_slugify_handles_noisy_names(self) -> None:
        self.assertEqual(slugify("Princess Peach!!"), "princess-peach")
        self.assertEqual(slugify("   "), "item")

    def test_image_filename_modes(self) -> None:
        self.assertEqual(image_filename(3, 100, "Princess Peach", "index"), "003.png")
        self.assertEqual(image_filename(3, 100, "Princess Peach", "slug"), "princess-peach.png")
        self.assertEqual(image_filename(3, 100, "Princess Peach", "both"), "003-princess-peach.png")

    def test_parse_text_lines_skips_empty_values(self) -> None:
        self.assertEqual(parse_text_lines("Mario\n\n  Luigi  \n"), ["Mario", "Luigi"])

    def test_parse_csv_file_reads_first_column(self) -> None:
        tmp = temporary_workspace()
        path = tmp / "items.csv"
        path.write_text("Mario,hero\nLuigi,hero\n,blank\n", encoding="utf-8")
        self.assertEqual(parse_csv_file(path), ["Mario", "Luigi"])

    def test_generate_pack_writes_images_and_manifest(self) -> None:
        tmp = temporary_workspace()
        output_dir = tmp / "pack"
        manifest = generate_pack(
            ["Mario", "Princess Peach"],
            output_dir,
            title="Smoke Pack",
            size=256,
            preset=get_preset("clean"),
            filename_mode="both",
            write_manifest=True,
        )

        self.assertEqual(len(manifest.items), 2)
        self.assertTrue((output_dir / "001-mario.png").exists())
        self.assertTrue((output_dir / "002-princess-peach.png").exists())

        manifest_data = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest_data["title"], "Smoke Pack")
        self.assertEqual(manifest_data["items"][0]["filename"], "001-mario.png")

    def test_zip_pack_writes_archive(self) -> None:
        tmp = temporary_workspace()
        output_dir = tmp / "pack"
        output_dir.mkdir()
        (output_dir / "manifest.json").write_text("{}", encoding="utf-8")
        zip_path = tmp / "pack.zip"

        zip_pack(output_dir, zip_path)

        self.assertTrue(zip_path.exists())
        self.assertGreater(zip_path.stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
