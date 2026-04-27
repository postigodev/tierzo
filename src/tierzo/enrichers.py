from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import httpx


@dataclass(frozen=True)
class EnrichedAsset:
    query: str
    title: str
    source_type: str
    source_value: str
    source_url: str
    image_path: Path
    confidence: float


class TmdbMovieEnricher:
    image_base_url = "https://image.tmdb.org/t/p/w500"
    web_base_url = "https://www.themoviedb.org/movie"

    def __init__(self, api_key: str, *, timeout: float = 12.0) -> None:
        self.api_key = api_key
        self.client = httpx.Client(timeout=timeout)

    def enrich_many(self, values: list[str], image_dir: Path) -> dict[str, EnrichedAsset]:
        image_dir.mkdir(parents=True, exist_ok=True)
        assets: dict[str, EnrichedAsset] = {}
        for value in values:
            asset = self.enrich(value, image_dir)
            if asset:
                assets[value] = asset
        return assets

    def enrich(self, value: str, image_dir: Path) -> EnrichedAsset | None:
        response = self.client.get(
            "https://api.themoviedb.org/3/search/movie",
            params={
                "api_key": self.api_key,
                "include_adult": "false",
                "language": "en-US",
                "page": 1,
                "query": value,
            },
        )
        response.raise_for_status()
        results = response.json().get("results", [])
        candidates = [candidate for candidate in results if candidate.get("poster_path")]
        if not candidates:
            return None

        best = candidates[0]
        poster_path = best["poster_path"]
        movie_id = str(best["id"])
        image_response = self.client.get(f"{self.image_base_url}{poster_path}")
        image_response.raise_for_status()
        image_path = image_dir / f"tmdb-{movie_id}.jpg"
        image_path.write_bytes(image_response.content)

        return EnrichedAsset(
            query=value,
            title=best.get("title") or value,
            source_type="tmdb",
            source_value=movie_id,
            source_url=f"{self.web_base_url}/{movie_id}",
            image_path=image_path,
            confidence=score_candidate(value, best),
        )


def score_candidate(query: str, candidate: dict[str, object]) -> float:
    title = str(candidate.get("title") or "").casefold()
    normalized_query = query.casefold().strip()
    if title == normalized_query:
        return 0.98
    if normalized_query in title or title in normalized_query:
        return 0.82
    return 0.64
