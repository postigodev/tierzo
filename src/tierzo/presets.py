from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TextCardPreset:
    name: str
    background: str
    text_color: str
    accent_color: str | None = None
    font_path: Path | None = None
    font_label: str = "default"
    background_opacity: float = 1.0
    border_width: int = 4
    corner_radius: int = 8
    glow_blur: int = 0
    italic: bool = False
    underline: bool = False
    strike: bool = False
    text_shadow: bool = False


PRESETS: dict[str, TextCardPreset] = {
    "clean": TextCardPreset(name="clean", background="#FFFFFF", text_color="#111111"),
    "dark": TextCardPreset(name="dark", background="#111111", text_color="#FFFFFF"),
    "arcade": TextCardPreset(name="arcade", background="#101820", text_color="#FEE715", accent_color="#FEE715"),
    "bubblegum": TextCardPreset(name="bubblegum", background="#FDE7F3", text_color="#241623", accent_color="#FF4F9A"),
    "hero-hud": TextCardPreset(
        name="hero-hud",
        background="#F2F0E8",
        text_color="#1E2633",
        accent_color="#F59E0B",
        font_path=Path("C:/Windows/Fonts/impact.ttf"),
        font_label="impact",
    ),
    "mono-soul": TextCardPreset(
        name="mono-soul",
        background="#050505",
        text_color="#FFFFFF",
        accent_color="#FF2E49",
        font_path=Path("C:/Windows/Fonts/consolab.ttf"),
        font_label="consolas",
    ),
    "creature-dex": TextCardPreset(
        name="creature-dex",
        background="#2B6DE8",
        text_color="#FFF6A8",
        accent_color="#FFCB05",
        font_path=Path("C:/Windows/Fonts/trebucbd.ttf"),
        font_label="trebuchet",
    ),
    "cyber-mint": TextCardPreset(
        name="cyber-mint",
        background="#071E22",
        text_color="#D8FFF3",
        accent_color="#25F4C8",
        font_path=Path("C:/Windows/Fonts/bahnschrift.ttf"),
        font_label="bahnschrift",
    ),
    "blood-moon": TextCardPreset(
        name="blood-moon",
        background="#21070A",
        text_color="#FFE8D6",
        accent_color="#D72638",
        font_path=Path("C:/Windows/Fonts/georgiab.ttf"),
        font_label="georgia",
    ),
}


def get_preset(name: str) -> TextCardPreset:
    try:
        return PRESETS[name]
    except KeyError as exc:
        available = ", ".join(sorted(PRESETS))
        raise ValueError(f"Unknown preset '{name}'. Available presets: {available}") from exc
