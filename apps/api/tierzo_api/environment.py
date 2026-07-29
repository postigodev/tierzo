from __future__ import annotations

import os
from collections.abc import MutableMapping
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]


def load_env_file(
    env_path: Path,
    *,
    environ: MutableMapping[str, str] | None = None,
) -> None:
    target = os.environ if environ is None else environ
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        normalized_key = key.strip()
        if normalized_key and normalized_key not in target:
            target[normalized_key] = value.strip().strip('"').strip("'")


def load_root_env() -> None:
    load_env_file(ROOT_DIR / ".env")


load_root_env()
