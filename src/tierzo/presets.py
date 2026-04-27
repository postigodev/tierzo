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


PRESETS: dict[str, TextCardPreset] = {
    "clean": TextCardPreset(name="clean", background="#FFFFFF", text_color="#111111"),
    "dark": TextCardPreset(name="dark", background="#111111", text_color="#FFFFFF"),
    "arcade": TextCardPreset(name="arcade", background="#101820", text_color="#FEE715", accent_color="#FEE715"),
    "bubblegum": TextCardPreset(name="bubblegum", background="#FDE7F3", text_color="#241623", accent_color="#FF4F9A"),
}


def get_preset(name: str) -> TextCardPreset:
    try:
        return PRESETS[name]
    except KeyError as exc:
        available = ", ".join(sorted(PRESETS))
        raise ValueError(f"Unknown preset '{name}'. Available presets: {available}") from exc
