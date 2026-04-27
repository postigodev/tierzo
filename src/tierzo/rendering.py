from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont, ImageOps

from .presets import TextCardPreset


DEFAULT_SIZE = 1024
DEFAULT_PADDING_RATIO = 0.1
DEFAULT_FONT_SIZE = 180
MIN_FONT_SIZE = 20
LINE_SPACING_RATIO = 0.2
BACKGROUND_MATTE = "#050505"
ITALIC_SHEAR = 0.22


def get_font(font_path: Path | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if font_path and font_path.exists():
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
    background = blend_with_matte(preset.background, preset.background_opacity)
    image = Image.new("RGB", (image_size, image_size), background)

    if preset.accent_color and preset.glow_blur > 0:
        glow = Image.new("RGBA", (image_size, image_size), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        inset = max(12, image_size // 48)
        glow_draw.rounded_rectangle(
            (inset, inset, image_size - inset, image_size - inset),
            radius=max(8, preset.corner_radius * image_size // 96),
            outline=hex_to_rgba(preset.accent_color, 170),
            width=max(4, preset.border_width * image_size // 128),
        )
        glow = glow.filter(ImageFilter.GaussianBlur(radius=max(1, preset.glow_blur * image_size // 256)))
        image = Image.alpha_composite(image.convert("RGBA"), glow).convert("RGB")

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

    if preset.accent_color and preset.border_width > 0:
        inset = max(12, image_size // 48)
        draw.rounded_rectangle(
            (inset, inset, image_size - inset, image_size - inset),
            radius=max(0, preset.corner_radius * image_size // 96),
            outline=preset.accent_color,
            width=max(1, preset.border_width * image_size // 128),
        )

    image = image.convert("RGBA")
    y = (image_size - block_height) / 2
    for index, line in enumerate(lines):
        width = widths[index]
        x = (image_size - width) / 2
        if preset.text_shadow:
            shadow_offset = max(2, image_size // 128)
            draw_text_layer(
                image,
                line,
                font,
                (x + shadow_offset, y + shadow_offset),
                fill=shadow_color(preset.background),
                italic=preset.italic,
                underline=preset.underline,
                strike=preset.strike,
                image_size=image_size,
            )
        draw_text_layer(
            image,
            line,
            font,
            (x, y),
            fill=preset.text_color,
            italic=preset.italic,
            underline=preset.underline,
            strike=preset.strike,
            image_size=image_size,
        )
        y += line_heights[index] + line_spacing

    image.convert("RGB").save(output_path, format="PNG")


def draw_image_card(
    source_path: Path,
    output_path: Path,
    image_size: int,
    *,
    background: str = "#050505",
    accent_color: str | None = None,
) -> None:
    with Image.open(source_path) as source:
        image = ImageOps.fit(source.convert("RGB"), (image_size, image_size), method=Image.Resampling.LANCZOS)

    if accent_color:
        draw = ImageDraw.Draw(image)
        inset = max(6, image_size // 80)
        draw.rounded_rectangle(
            (inset, inset, image_size - inset, image_size - inset),
            radius=max(8, image_size // 32),
            outline=accent_color,
            width=max(3, image_size // 128),
        )
    elif background:
        canvas = Image.new("RGB", (image_size, image_size), background)
        canvas.paste(image)
        image = canvas

    image.save(output_path, format="PNG")


def draw_text_layer(
    image: Image.Image,
    text: str,
    font: ImageFont.ImageFont,
    position: tuple[float, float],
    *,
    fill: str,
    italic: bool,
    underline: bool,
    strike: bool,
    image_size: int,
) -> None:
    probe = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    probe_draw = ImageDraw.Draw(probe)
    left, top, right, bottom = probe_draw.textbbox((0, 0), text or " ", font=font)
    width = max(1, right - left)
    height = max(1, bottom - top)
    padding = max(6, image_size // 96)
    layer = Image.new("RGBA", (width + padding * 2, height + padding * 3), (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer)
    text_x = padding - left
    text_y = padding - top
    layer_draw.text((text_x, text_y), text, font=font, fill=fill)

    decoration_width = max(2, image_size // 160)
    if underline:
        underline_y = padding + height + max(2, image_size // 128)
        layer_draw.line((padding, underline_y, padding + width, underline_y), fill=fill, width=decoration_width)
    if strike:
        strike_y = padding + height / 2
        layer_draw.line((padding, strike_y, padding + width, strike_y), fill=fill, width=decoration_width)

    if italic:
        layer = shear_layer(layer)

    x, y = position
    image.alpha_composite(layer, (round(x - padding), round(y - padding)))


def shear_layer(layer: Image.Image) -> Image.Image:
    extra_width = max(1, round(abs(ITALIC_SHEAR) * layer.height))
    output_width = layer.width + extra_width
    x_offset = extra_width if ITALIC_SHEAR < 0 else 0
    return layer.transform(
        (output_width, layer.height),
        Image.Transform.AFFINE,
        (1, ITALIC_SHEAR, -x_offset, 0, 1, 0),
        resample=Image.Resampling.BICUBIC,
    )


def hex_to_rgba(value: str, alpha: int) -> tuple[int, int, int, int]:
    red, green, blue = ImageColor.getrgb(value)
    return red, green, blue, alpha


def blend_with_matte(value: str, opacity: float) -> str:
    opacity = max(0.0, min(1.0, opacity))
    red, green, blue = ImageColor.getrgb(value)
    matte_red, matte_green, matte_blue = ImageColor.getrgb(BACKGROUND_MATTE)
    blended = (
        round((red * opacity) + (matte_red * (1 - opacity))),
        round((green * opacity) + (matte_green * (1 - opacity))),
        round((blue * opacity) + (matte_blue * (1 - opacity))),
    )
    return "#{:02x}{:02x}{:02x}".format(*blended)


def shadow_color(background: str) -> str:
    red, green, blue = ImageColor.getrgb(background)
    brightness = (red * 299 + green * 587 + blue * 114) / 1000
    return "#000000" if brightness > 130 else "#FFFFFF"
