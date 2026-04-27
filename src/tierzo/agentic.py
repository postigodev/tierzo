from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

from .parsers import parse_text_lines


DOMAINS = {"movies", "games", "music", "generic"}
TOOLS = {"tmdb_movie", "steam", "spotify", "text"}


@dataclass(frozen=True)
class IntakePlan:
    domain: str
    tool: str
    items: list[str]
    confidence: float
    questions: list[str]
    source: str
    cache_hit: bool = False

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def plan_intake(
    text: str,
    *,
    cache_dir: Path,
    openai_api_key: str | None = None,
    force_refresh: bool = False,
) -> IntakePlan:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{cache_key(text)}.json"
    if cache_path.exists() and not force_refresh:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        cached.pop("cache_hit", None)
        return IntakePlan(**cached, cache_hit=True)

    plan = None
    if openai_api_key:
        plan = plan_with_openai(text, openai_api_key=openai_api_key)
    if plan is None:
        plan = plan_with_heuristics(text)

    cache_data = plan.to_dict()
    cache_data.pop("cache_hit", None)
    cache_path.write_text(json.dumps(cache_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return plan


def plan_with_openai(text: str, *, openai_api_key: str) -> IntakePlan | None:
    try:
        response = httpx.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                "input": [
                    {
                        "role": "system",
                        "content": (
                            "You are Tierzo's intake planner. Convert user input into a concise JSON plan. "
                            "Pick domain from movies, games, music, generic. Pick tool from tmdb_movie, steam, spotify, text. "
                            "If the input is already a list, keep those items. If it is a prompt, return 5-12 likely items. "
                            "Return only JSON with keys: domain, tool, items, confidence, questions."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
                "text": {"format": {"type": "json_object"}},
                "temperature": 0.2,
            },
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()
        content = body["output"][0]["content"][0]["text"]
        data = json.loads(content)
        return normalize_plan(data, source="openai")
    except Exception:
        return None


def plan_with_heuristics(text: str) -> IntakePlan:
    items = parse_text_lines(text)
    lowered = text.casefold()
    movie_terms = ["movie", "movies", "film", "films", "horror", "a24", "director", "cinema"]
    game_terms = ["game", "games", "steam", "ps2", "xbox", "nintendo", "playstation"]
    music_terms = ["song", "songs", "album", "albums", "artist", "spotify", "playlist"]

    if any(term in lowered for term in movie_terms):
        domain, tool, confidence = "movies", "tmdb_movie", 0.72
    elif any(term in lowered for term in game_terms):
        domain, tool, confidence = "games", "text", 0.62
    elif any(term in lowered for term in music_terms):
        domain, tool, confidence = "music", "text", 0.62
    else:
        domain, tool, confidence = "generic", "text", 0.55

    return IntakePlan(
        domain=domain,
        tool=tool,
        items=items,
        confidence=confidence,
        questions=[],
        source="heuristic",
    )


def normalize_plan(data: dict[str, object], *, source: str) -> IntakePlan:
    domain = str(data.get("domain") or "generic")
    tool = str(data.get("tool") or "text")
    items = [str(item).strip() for item in data.get("items", []) if str(item).strip()]
    questions = [str(question).strip() for question in data.get("questions", []) if str(question).strip()]
    confidence = float(data.get("confidence") or 0.6)

    if domain not in DOMAINS:
        domain = "generic"
    if tool not in TOOLS:
        tool = "text"
    if not items:
        items = parse_text_lines(str(data.get("input") or ""))
    return IntakePlan(
        domain=domain,
        tool=tool,
        items=items,
        confidence=max(0.0, min(1.0, confidence)),
        questions=questions,
        source=source,
    )


def cache_key(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()
