from __future__ import annotations

import json
import unittest
import uuid
from pathlib import Path

from tierzo.export import generate_pack, generate_pack_from_items, zip_pack
from tierzo.filenames import image_filename, slugify
from tierzo.agentic import plan_intake
from tierzo.models import SourceItem, source_items_from_strings
from tierzo.parsers import parse_csv_file, parse_text_lines
from tierzo.presets import PRESETS, get_preset


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
            extra_manifest={"description": "A smoke pack"},
        )

        self.assertEqual(len(manifest.items), 2)
        self.assertTrue((output_dir / "001-mario.png").exists())
        self.assertTrue((output_dir / "002-princess-peach.png").exists())

        manifest_data = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest_data["title"], "Smoke Pack")
        self.assertEqual(manifest_data["description"], "A smoke pack")
        self.assertEqual(manifest_data["items"][0]["filename"], "001-mario.png")
        self.assertEqual([item["id"] for item in manifest_data["items"]], ["001", "002"])

    def test_generate_pack_from_items_preserves_source_ids(self) -> None:
        tmp = temporary_workspace()
        output_dir = tmp / "structured-pack"
        manifest = generate_pack_from_items(
            [
                SourceItem(id="movie-alien", name="Alien"),
                SourceItem(id="movie-thing", name="The Thing"),
            ],
            output_dir,
            title="Structured Pack",
            size=256,
            preset=get_preset("clean"),
            filename_mode="both",
            write_manifest=True,
        )

        self.assertEqual([item.id for item in manifest.items], ["movie-alien", "movie-thing"])
        manifest_data = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest_data["schema_version"], "tierzo.pack.v1")
        self.assertEqual(
            [item["id"] for item in manifest_data["items"]],
            ["movie-alien", "movie-thing"],
        )

    def test_slug_filenames_are_unique_for_duplicate_names(self) -> None:
        tmp = temporary_workspace()
        source_items = [
            SourceItem(id="alien-1", name="Alien"),
            SourceItem(id="alien-2", name="Alien"),
            SourceItem(id="alien-3", name="Alien!"),
        ]

        def generate(output_name: str):
            return generate_pack_from_items(
                source_items,
                tmp / output_name,
                title="Duplicate Slugs",
                size=256,
                preset=get_preset("clean"),
                filename_mode="slug",
                write_manifest=True,
            )

        manifest = generate("duplicate-slugs")
        regenerated = generate("duplicate-slugs-regenerated")
        filenames = [item.filename for item in manifest.items]
        self.assertEqual(filenames, ["alien.png", "alien-2.png", "alien-3.png"])
        self.assertEqual(
            [item.filename for item in regenerated.items],
            filenames,
        )
        self.assertEqual(len(list((tmp / "duplicate-slugs").glob("*.png"))), 3)

    def test_legacy_source_item_ids_keep_minimum_three_digit_format(self) -> None:
        items = source_items_from_strings([f"Item {index}" for index in range(1000)])
        self.assertEqual(items[0].id, "001")
        self.assertEqual(items[998].id, "999")
        self.assertEqual(items[999].id, "1000")

    def test_structured_pack_rejects_invalid_item_identity(self) -> None:
        tmp = temporary_workspace()
        common = {
            "output_dir": tmp / "invalid-identity",
            "title": "Invalid",
            "size": 256,
            "preset": get_preset("clean"),
            "filename_mode": "both",
            "write_manifest": True,
        }
        with self.assertRaisesRegex(ValueError, "unique"):
            generate_pack_from_items(
                [SourceItem("same", "Alien"), SourceItem("same", "Aliens")],
                **common,
            )
        with self.assertRaisesRegex(ValueError, "blank"):
            generate_pack_from_items([SourceItem("", "Alien")], **common)

    def test_opinionated_presets_are_available(self) -> None:
        for name in ["hero-hud", "mono-soul", "creature-dex", "cyber-mint", "blood-moon"]:
            self.assertIn(name, PRESETS)

    def test_agentic_intake_uses_cache(self) -> None:
        tmp = temporary_workspace()
        first = plan_intake("Alien\nThe Thing", cache_dir=tmp)
        second = plan_intake("Alien\nThe Thing", cache_dir=tmp)

        self.assertEqual(first.items, ["Alien", "The Thing"])
        self.assertEqual(second.items, ["Alien", "The Thing"])
        self.assertFalse(first.cache_hit)
        self.assertTrue(second.cache_hit)

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
