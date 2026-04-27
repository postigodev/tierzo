from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .presets import TextCardPreset


DEFAULT_SIZE = 1024
DEFAULT_PADDING_RATIO = 0.1
DEFAULT_FONT_SIZE = 180
MIN_FONT_SIZE = 20
LINE_SPACING_RATIO = 0.2


def get_font(font_path: Path | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if font_path:
        return ImageFont.truetype(str(font_path), size=size)

    common_fonts = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/calibri.ttf"),
        Path("C:/Windows/Fonts/tahoma.ttf"),
    ]

    for candidate in common_fonts:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)

    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    explicit_lines = text.split("\n")
    wrapped_lines: list[str] = []

    for line in explicit_lines:
        words = line.split()
        if not words:
            wrapped_lines.append("")
            continue

        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            trial_width = draw.textbbox((0, 0), trial, font=font)[2]
            if trial_width <= max_width:
                current = trial
            else:
                wrapped_lines.append(current)
                current = word
        wrapped_lines.append(current)

    return wrapped_lines


def measure_text_block(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    font: ImageFont.ImageFont,
) -> tuple[int, int]:
    widths: list[int] = []
    heights: list[int] = []

    for line in lines:
        left, top, right, bottom = draw.textbbox((0, 0), line or " ", font=font)
        widths.append(right - left)
        heights.append(bottom - top)

    line_height = max(heights) if heights else 0
    line_spacing = max(4, int(line_height * LINE_SPACING_RATIO))
    total_height = sum(heights) + max(0, len(lines) - 1) * line_spacing
    total_width = max(widths) if widths else 0
    return total_width, total_height


def fit_text_to_box(
    image_size: int,
    text: str,
    font_path: Path | None,
) -> tuple[ImageFont.ImageFont, list[str]]:
    image = Image.new("RGB", (image_size, image_size))
    draw = ImageDraw.Draw(image)
    padding = int(image_size * DEFAULT_PADDING_RATIO)
    max_width = image_size - (padding * 2)
    max_height = image_size - (padding * 2)

    start_font_size = max(MIN_FONT_SIZE, min(DEFAULT_FONT_SIZE, image_size // 4))

    for font_size in range(start_font_size, MIN_FONT_SIZE - 1, -2):
        font = get_font(font_path, font_size)

        single_line = text.replace("\n", " ")
        single_width, single_height = measure_text_block(draw, [single_line], font)
        if single_width <= max_width and single_height <= max_height:
            return font, [single_line]

        wrapped_lines = wrap_text(draw, text, font, max_width)
        wrapped_width, wrapped_height = measure_text_block(draw, wrapped_lines, font)
        if wrapped_width <= max_width and wrapped_height <= max_height:
            return font, wrapped_lines

    font = get_font(font_path, MIN_FONT_SIZE)
    return font, wrap_text(draw, text, font, max_width)


def draw_centered_text(
    text: str,
    output_path: Path,
    image_size: int,
    preset: TextCardPreset,
) -> None:
    image = Image.new("RGB", (image_size, image_size), preset.background)
    draw = ImageDraw.Draw(image)
    font, lines = fit_text_to_box(image_size, text, preset.font_path)

    widths: list[int] = []
    boxes: list[tuple[int, int, int, int]] = []
    for line in lines:
        box = draw.textbbox((0, 0), line or " ", font=font)
        boxes.append(box)
        widths.append(box[2] - box[0])

    line_heights = [box[3] - box[1] for box in boxes]
    line_height = max(line_heights) if line_heights else 0
    line_spacing = max(4, int(line_height * LINE_SPACING_RATIO))
    block_height = sum(line_heights) + max(0, len(lines) - 1) * line_spacing

    if preset.accent_color:
        inset = max(12, image_size // 48)
        draw.rounded_rectangle(
            (inset, inset, image_size - inset, image_size - inset),
            radius=max(8, image_size // 48),
            outline=preset.accent_color,
            width=max(4, image_size // 128),
        )

    y = (image_size - block_height) / 2
    for index, line in enumerate(lines):
        width = widths[index]
        x = (image_size - width) / 2
        draw.text((x, y), line, font=font, fill=preset.text_color)
        y += line_heights[index] + line_spacing

    image.save(output_path, format="PNG")
