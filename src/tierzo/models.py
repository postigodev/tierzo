from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class PackItem:
    id: str
    name: str
    filename: str
    status: str
    source_type: str
    source_value: str | None
    asset_kind: str
    width: int
    height: int

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class PackManifest:
    title: str
    version: str
    items: list[PackItem]

    def to_dict(self) -> dict[str, object]:
        return {
            "title": self.title,
            "version": self.version,
            "items": [item.to_dict() for item in self.items],
        }
