from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .export import generate_pack, zip_pack
from .parsers import parse_input_file
from .presets import get_preset
from .rendering import DEFAULT_SIZE


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate Tierzo image packs from TXT, CSV, or XLSX input.",
    )
    parser.add_argument("input_file", type=Path, help="Input .txt, .csv, or .xlsx file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output folder. Defaults to <input_stem>_tierzo",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=DEFAULT_SIZE,
        help=f"Square image size in pixels. Default: {DEFAULT_SIZE}",
    )
    parser.add_argument(
        "--preset",
        default="clean",
        help="Text-card preset. Options: clean, dark, arcade, bubblegum",
    )
    parser.add_argument(
        "--filename-mode",
        choices=["index", "slug", "both"],
        default="index",
        help="How to name generated images. Default: index",
    )
    parser.add_argument(
        "--title",
        help="Pack title for manifest metadata. Defaults to the input filename.",
    )
    parser.add_argument(
        "--no-manifest",
        action="store_true",
        help="Skip writing manifest.json.",
    )
    parser.add_argument(
        "--zip",
        action="store_true",
        help="Create a ZIP file next to the output folder.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    input_file = args.input_file.expanduser().resolve()
    if not input_file.exists():
        print(f"Input file not found: {input_file}", file=sys.stderr)
        return 1

    try:
        values = parse_input_file(input_file)
        preset = get_preset(args.preset)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if not values:
        print("No non-empty values found in the input.", file=sys.stderr)
        return 1

    output_dir = args.output.expanduser().resolve() if args.output else input_file.with_name(f"{input_file.stem}_tierzo")
    title = args.title or input_file.stem

    manifest = generate_pack(
        values,
        output_dir,
        title=title,
        size=args.size,
        preset=preset,
        filename_mode=args.filename_mode,
        write_manifest=not args.no_manifest,
    )

    message = f"Created {len(manifest.items)} image(s) in {output_dir}"
    if args.zip:
        zip_path = output_dir.with_suffix(".zip")
        zip_pack(output_dir, zip_path)
        message = f"{message}\nCreated ZIP: {zip_path}"

    print(message)
    return 0
