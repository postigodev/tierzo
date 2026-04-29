from __future__ import annotations

import json
import zipfile
from pathlib import Path

from .filenames import image_filename
from .enrichers import EnrichedAsset
from .models import PackItem, PackManifest
from .presets import TextCardPreset
from .rendering import draw_centered_text, draw_image_card


def generate_pack(
    values: list[str],
    output_dir: Path,
    *,
    title: str,
    size: int,
    preset: TextCardPreset,
    filename_mode: str,
    write_manifest: bool,
    extra_manifest: dict[str, object] | None = None,
    enriched_assets: dict[str, EnrichedAsset] | None = None,
) -> PackManifest:
    output_dir.mkdir(parents=True, exist_ok=True)

    items: list[PackItem] = []
    total = len(values)
    for index, text in enumerate(values, start=1):
        filename = image_filename(index, total, text, filename_mode)
        output_path = output_dir / filename
        enriched_asset = (enriched_assets or {}).get(text)
        if enriched_asset:
            draw_image_card(
                enriched_asset.image_path,
                output_path,
                size,
                background=preset.background,
                accent_color=preset.accent_color,
                label_text=text,
                label_position=preset.image_label_position,
                text_color=preset.text_color,
                font_path=preset.font_path,
            )
        else:
            draw_centered_text(text=text, output_path=output_path, image_size=size, preset=preset)

        items.append(
            PackItem(
                id=f"{index:03d}",
                name=text,
                filename=filename,
                status="ready",
                source_type=enriched_asset.source_type if enriched_asset else "input",
                source_value=enriched_asset.source_value if enriched_asset else None,
                source_url=enriched_asset.source_url if enriched_asset else None,
                asset_kind="image-card" if enriched_asset else "text-card",
                confidence=enriched_asset.confidence if enriched_asset else None,
                width=size,
                height=size,
            )
        )

    manifest = PackManifest(title=title, version="0.1.0", items=items)
    if write_manifest:
        write_manifest_file(manifest, output_dir / "manifest.json", extra_manifest=extra_manifest)

    return manifest


def write_manifest_file(
    manifest: PackManifest,
    output_path: Path,
    *,
    extra_manifest: dict[str, object] | None = None,
) -> None:
    data = manifest.to_dict()
    if extra_manifest:
        data.update(extra_manifest)

    output_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def zip_pack(output_dir: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(output_dir.iterdir()):
            if path.is_file():
                archive.write(path, arcname=path.name)
