from __future__ import annotations

import re


def slugify(value: str) -> str:
    slug = value.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "item"


def image_filename(index: int, total: int, name: str, mode: str) -> str:
    digits = max(3, len(str(total)))
    prefix = f"{index:0{digits}d}"

    if mode == "index":
        return f"{prefix}.png"
    if mode == "slug":
        return f"{slugify(name)}.png"
    if mode == "both":
        return f"{prefix}-{slugify(name)}.png"

    raise ValueError("filename mode must be one of: index, slug, both")


def unique_image_filename(
    index: int,
    total: int,
    name: str,
    mode: str,
    used_filenames: set[str],
) -> str:
    filename = image_filename(index, total, name, mode)
    if filename not in used_filenames:
        used_filenames.add(filename)
        return filename

    stem, extension = filename.rsplit(".", 1)
    suffix = 2
    while f"{stem}-{suffix}.{extension}" in used_filenames:
        suffix += 1

    filename = f"{stem}-{suffix}.{extension}"
    used_filenames.add(filename)
    return filename
