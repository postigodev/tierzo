from __future__ import annotations

import json
import os
import re
import shutil
from collections import OrderedDict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Callable, Literal

from fastapi import HTTPException


PackStatus = Literal["completed", "expired", "lost"]
_SAFE_PACK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
_UTC_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$"
)


def utc_timestamp(value: datetime | None = None) -> str:
    timestamp = value or datetime.now(UTC)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class PackLifecycle:
    pack_id: str
    status: PackStatus
    created_at: str | None = None
    expires_at: str | None = None


@dataclass(frozen=True)
class _Tombstone:
    lifecycle: PackLifecycle
    retained_at: datetime


class PackLifecycleRegistry:
    def __init__(
        self,
        storage_dir: Path,
        *,
        tombstone_capacity: int = 1024,
        tombstone_retention_seconds: float = 3600,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.storage_dir = storage_dir.resolve()
        self.tombstone_capacity = max(0, tombstone_capacity)
        self.tombstone_retention_seconds = max(0.0, tombstone_retention_seconds)
        self._clock = clock or (lambda: datetime.now(UTC))
        self._tombstones: OrderedDict[str, _Tombstone] = OrderedDict()

    def new_lifecycle(self, pack_id: str, ttl_seconds: float) -> PackLifecycle:
        now = self._now()
        return PackLifecycle(
            pack_id=pack_id,
            status="completed",
            created_at=utc_timestamp(now),
            expires_at=utc_timestamp(now + timedelta(seconds=ttl_seconds)),
        )

    def resolve(self, pack_id: str) -> PackLifecycle:
        now = self._now()
        self._evict_tombstones(now)

        tombstone = self._tombstones.get(pack_id)
        if tombstone is not None:
            return tombstone.lifecycle

        if not _SAFE_PACK_ID.fullmatch(pack_id):
            return PackLifecycle(pack_id=pack_id, status="lost")

        pack_dir = self.storage_dir / pack_id
        manifest_path = pack_dir / "manifest.json"
        manifest = self._read_manifest(manifest_path)
        metadata = self._lifecycle_metadata(manifest)
        if metadata is None:
            return PackLifecycle(pack_id=pack_id, status="lost")

        created_at, expires_at, expires_at_value = metadata
        if expires_at_value <= now:
            lifecycle = PackLifecycle(
                pack_id=pack_id,
                status="expired",
                created_at=created_at,
                expires_at=expires_at,
            )
            self._delete_artifacts(pack_id)
            self._remember_expired(lifecycle, now)
            return lifecycle

        lifecycle = PackLifecycle(
            pack_id=pack_id,
            status="completed",
            created_at=created_at,
            expires_at=expires_at,
        )
        if self._has_complete_artifact_set(pack_id, pack_dir, manifest):
            return lifecycle
        return PackLifecycle(
            pack_id=pack_id,
            status="lost",
            created_at=created_at,
            expires_at=expires_at,
        )

    def cleanup_expired(self) -> None:
        now = self._now()
        self._evict_tombstones(now)
        if not self.storage_dir.is_dir():
            return
        for child in self.storage_dir.iterdir():
            if child.is_dir() and _SAFE_PACK_ID.fullmatch(child.name):
                self.resolve(child.name)

    def _now(self) -> datetime:
        now = self._clock()
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)
        return now.astimezone(UTC)

    @staticmethod
    def _read_manifest(manifest_path: Path) -> dict[str, object] | None:
        if not manifest_path.is_file():
            return None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            return None
        return manifest if isinstance(manifest, dict) else None

    @staticmethod
    def _parse_timestamp(value: object) -> datetime | None:
        if not isinstance(value, str) or not _UTC_TIMESTAMP.fullmatch(value):
            return None
        try:
            parsed = datetime.fromisoformat(f"{value[:-1]}+00:00")
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(UTC)

    @classmethod
    def _lifecycle_metadata(
        cls,
        manifest: dict[str, object] | None,
    ) -> tuple[str, str, datetime] | None:
        if manifest is None:
            return None
        created_at = manifest.get("created_at")
        expires_at = manifest.get("expires_at")
        created_at_value = cls._parse_timestamp(created_at)
        expires_at_value = cls._parse_timestamp(expires_at)
        if (
            not isinstance(created_at, str)
            or not isinstance(expires_at, str)
            or created_at_value is None
            or expires_at_value is None
            or created_at_value > expires_at_value
        ):
            return None
        return created_at, expires_at, expires_at_value

    def _has_complete_artifact_set(
        self,
        pack_id: str,
        pack_dir: Path,
        manifest: dict[str, object] | None,
    ) -> bool:
        if not pack_dir.is_dir() or manifest is None:
            return False
        zip_path = self.storage_dir / f"{pack_id}.zip"
        if not zip_path.is_file():
            return False
        items = manifest.get("items")
        if not isinstance(items, list):
            return False
        for item in items:
            if not isinstance(item, dict):
                return False
            filename = item.get("filename")
            if (
                not isinstance(filename, str)
                or not filename
                or Path(filename).name != filename
                or not (pack_dir / filename).is_file()
            ):
                return False
        return True

    def _delete_artifacts(self, pack_id: str) -> None:
        pack_dir = (self.storage_dir / pack_id).resolve()
        zip_path = (self.storage_dir / f"{pack_id}.zip").resolve()
        if pack_dir.parent == self.storage_dir and pack_dir.is_dir():
            try:
                shutil.rmtree(pack_dir)
            except OSError:
                pass
        if zip_path.parent == self.storage_dir and zip_path.is_file():
            try:
                zip_path.unlink()
            except OSError:
                pass

    def _remember_expired(
        self,
        lifecycle: PackLifecycle,
        retained_at: datetime,
    ) -> None:
        if self.tombstone_capacity == 0 or self.tombstone_retention_seconds == 0:
            return
        self._tombstones[lifecycle.pack_id] = _Tombstone(
            lifecycle=lifecycle,
            retained_at=retained_at,
        )
        self._tombstones.move_to_end(lifecycle.pack_id)
        while len(self._tombstones) > self.tombstone_capacity:
            self._tombstones.popitem(last=False)

    def _evict_tombstones(self, now: datetime) -> None:
        expired_ids = [
            pack_id
            for pack_id, tombstone in self._tombstones.items()
            if (now - tombstone.retained_at).total_seconds()
            >= self.tombstone_retention_seconds
        ]
        for pack_id in expired_ids:
            self._tombstones.pop(pack_id, None)


ROOT_DIR = Path(__file__).resolve().parents[3]
STORAGE_DIR = Path(
    os.getenv("TIERZO_STORAGE_DIR", ROOT_DIR / ".tierzo" / "storage")
).resolve()
PACK_TOMBSTONE_CAPACITY = int(os.getenv("PACK_TOMBSTONE_CAPACITY", "1024"))
PACK_TOMBSTONE_RETENTION_SECONDS = float(
    os.getenv("PACK_TOMBSTONE_RETENTION_SECONDS", "3600")
)
PACK_LIFECYCLE_REGISTRY = PackLifecycleRegistry(
    STORAGE_DIR,
    tombstone_capacity=PACK_TOMBSTONE_CAPACITY,
    tombstone_retention_seconds=PACK_TOMBSTONE_RETENTION_SECONDS,
)


def resolve_pack_lifecycle(pack_id: str) -> PackLifecycle:
    return PACK_LIFECYCLE_REGISTRY.resolve(pack_id)


def lifecycle_error_detail(
    lifecycle: PackLifecycle,
    *,
    resource: str,
) -> dict[str, object]:
    return {
        "code": f"pack_{lifecycle.status}",
        "resource": resource,
        "status": lifecycle.status,
        "pack_id": lifecycle.pack_id,
        "created_at": lifecycle.created_at,
        "expires_at": lifecycle.expires_at,
    }


def require_available_pack(
    pack_id: str,
    *,
    resource: str = "pack",
) -> PackLifecycle:
    lifecycle = resolve_pack_lifecycle(pack_id)
    if lifecycle.status == "completed":
        return lifecycle
    raise HTTPException(
        status_code=410 if lifecycle.status == "expired" else 404,
        detail=lifecycle_error_detail(lifecycle, resource=resource),
    )
