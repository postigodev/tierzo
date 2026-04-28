from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tierzo.export import generate_pack
from tierzo.parsers import parse_xlsx_file
from tierzo.presets import TextCardPreset
from tierzo.rendering import DEFAULT_SIZE


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read the first column of an .xlsx file and create one square PNG "
            "per non-empty cell with centered text."
        )
    )
    parser.add_argument("xlsx_file", type=Path, help="Path to the input .xlsx file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output folder for generated images. Defaults to <xlsx_stem>_images",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=DEFAULT_SIZE,
        help=f"Square image size in pixels. Default: {DEFAULT_SIZE}",
    )
    parser.add_argument(
        "--background",
        default="#FFFFFF",
        help="Background color. Default: #FFFFFF",
    )
    parser.add_argument(
        "--text-color",
        default="#000000",
        help="Text color. Default: #000000",
    )
    parser.add_argument(
        "--font",
        type=Path,
        help="Optional path to a .ttf or .otf font file",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    xlsx_file = args.xlsx_file.expanduser().resolve()

    if not xlsx_file.exists():
        print(f"Input file not found: {xlsx_file}", file=sys.stderr)
        return 1

    if xlsx_file.suffix.lower() != ".xlsx":
        print("Input file must be an .xlsx file.", file=sys.stderr)
        return 1

    values = parse_xlsx_file(xlsx_file)
    if not values:
        print("No non-empty values found in the first column.", file=sys.stderr)
        return 1

    output_dir = args.output.expanduser().resolve() if args.output else xlsx_file.with_name(f"{xlsx_file.stem}_images")
    preset = TextCardPreset(
        name="legacy",
        background=args.background,
        text_color=args.text_color,
        font_path=args.font,
    )
    manifest = generate_pack(
        values,
        output_dir,
        title=xlsx_file.stem,
        size=args.size,
        preset=preset,
        filename_mode="index",
        write_manifest=False,
    )

    print(f"Created {len(manifest.items)} image(s) in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
