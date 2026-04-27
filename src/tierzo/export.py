from __future__ import annotations

import json
import zipfile
from pathlib import Path

from .filenames import image_filename
from .models import PackItem, PackManifest
from .presets import TextCardPreset
from .rendering import draw_centered_text


def generate_pack(
    values: list[str],
    output_dir: Path,
    *,
    title: str,
    size: int,
    preset: TextCardPreset,
    filename_mode: str,
    write_manifest: bool,
) -> PackManifest:
    output_dir.mkdir(parents=True, exist_ok=True)

    items: list[PackItem] = []
    total = len(values)
    for index, text in enumerate(values, start=1):
        filename = image_filename(index, total, text, filename_mode)
        output_path = output_dir / filename
        draw_centered_text(text=text, output_path=output_path, image_size=size, preset=preset)

        items.append(
            PackItem(
                id=f"{index:03d}",
                name=text,
                filename=filename,
                status="ready",
                source_type="input",
                source_value=None,
                asset_kind="text-card",
                width=size,
                height=size,
            )
        )

    manifest = PackManifest(title=title, version="0.1.0", items=items)
    if write_manifest:
        write_manifest_file(manifest, output_dir / "manifest.json")

    return manifest


def write_manifest_file(manifest: PackManifest, output_path: Path) -> None:
    output_path.write_text(
        json.dumps(manifest.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def zip_pack(output_dir: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(output_dir.iterdir()):
            if path.is_file():
                archive.write(path, arcname=path.name)
