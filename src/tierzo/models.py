from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class SourceItem:
    id: str
    name: str


def source_items_from_strings(values: list[str]) -> list[SourceItem]:
    return [
        SourceItem(id=f"{index:03d}", name=value)
        for index, value in enumerate(values, start=1)
    ]


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
    source_url: str | None = None
    confidence: float | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class PackManifest:
    title: str
    version: str
    items: list[PackItem]
    schema_version: str = "tierzo.pack.v1"

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "title": self.title,
            "version": self.version,
            "items": [item.to_dict() for item in self.items],
        }
