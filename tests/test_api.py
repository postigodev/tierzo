from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.append(str(Path("apps/api").resolve()))

from tierzo_api.main import app  # noqa: E402
from tierzo.enrichers import EnrichedAsset  # noqa: E402


class TierzoApiTests(unittest.TestCase):
    def test_create_pack_from_text(self) -> None:
        client = TestClient(app)

        response = client.post(
            "/packs",
            json={
                "text": "Mario\nLuigi",
                "preset": "clean",
                "size": 256,
                "filename_mode": "both",
                "title": "Smoke",
                "description": "Smoke description",
                "row_labels": ["God", "Good", "Ok"],
                "custom_preset": {
                    "background": "#050505",
                    "text_color": "#ffffff",
                    "accent_color": "#ff2e49",
                    "font_family": "consolas",
                    "bold": False,
                    "italic": True,
                    "underline": True,
                    "strike": True,
                    "text_shadow": True,
                    "background_opacity": 0.7,
                    "border_width": 8,
                    "corner_radius": 16,
                    "glow_blur": 12,
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["item_count"], 2)
        self.assertEqual(body["description"], "Smoke description")
        self.assertEqual(body["row_labels"], ["God", "Good", "Ok"])
        self.assertEqual(body["items"][0]["asset_kind"], "text-card")
        self.assertEqual(body["items"][0]["source_type"], "input")
        self.assertIsNone(body["items"][0]["confidence"])
        self.assertEqual(body["enrichment_status"], "text")
        self.assertEqual(body["items"][0]["filename"], "001-mario.png")
        self.assertIn("extension_url", body)

        extension_response = client.get(body["extension_url"])
        self.assertEqual(extension_response.status_code, 200)
        extension_body = extension_response.json()
        self.assertEqual(extension_body["schema_version"], "tierzo.tiermaker-extension.v1")
        self.assertEqual(extension_body["template"]["name"], "Smoke")
        self.assertEqual(extension_body["template"]["description"], "Smoke description")
        self.assertEqual(extension_body["tiermaker"]["image_cropping_orientation"], "Square")
        self.assertEqual(extension_body["tiermaker"]["row_labels"], ["God", "Good", "Ok"])
        self.assertEqual(extension_body["batches"][0]["image_count"], 2)
        self.assertTrue(extension_body["batches"][0]["images"][0]["url"].endswith("/001-mario.png"))

        manifest_response = client.get(body["manifest_url"])
        self.assertEqual(manifest_response.status_code, 200)
        manifest_body = manifest_response.json()
        self.assertEqual(manifest_body["card_style"]["background"], "#050505")
        self.assertEqual(manifest_body["card_style"]["font_family"], "consolas")
        self.assertEqual(manifest_body["card_style"]["bold"], False)
        self.assertEqual(manifest_body["card_style"]["italic"], True)
        self.assertEqual(manifest_body["card_style"]["underline"], True)
        self.assertEqual(manifest_body["card_style"]["strike"], True)
        self.assertEqual(manifest_body["card_style"]["text_shadow"], True)
        self.assertEqual(manifest_body["card_style"]["background_opacity"], 0.7)
        self.assertEqual(manifest_body["card_style"]["border_width"], 8)
        self.assertEqual(manifest_body["card_style"]["corner_radius"], 16)
        self.assertEqual(manifest_body["card_style"]["glow_blur"], 12)

    def test_tmdb_enrichment_without_key_falls_back_to_text_cards(self) -> None:
        previous_key = os.environ.pop("TMDB_API_KEY", None)
        client = TestClient(app)

        try:
            response = client.post(
                "/packs",
                json={
                    "text": "Alien\nThe Thing",
                    "preset": "arcade",
                    "size": 256,
                    "filename_mode": "both",
                    "title": "Movies",
                    "enrichment_mode": "tmdb_movie",
                },
            )
        finally:
            if previous_key is not None:
                os.environ["TMDB_API_KEY"] = previous_key

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("missing_api_key", body["enrichment_status"])
        manifest_response = client.get(body["manifest_url"])
        manifest_body = manifest_response.json()
        self.assertEqual(manifest_body["enrichment"]["mode"], "tmdb_movie")
        self.assertEqual(manifest_body["items"][0]["asset_kind"], "text-card")

    def test_tmdb_error_falls_back_to_text_cards(self) -> None:
        previous_key = os.environ.get("TMDB_API_KEY")
        os.environ["TMDB_API_KEY"] = "test"
        client = TestClient(app)

        def fake_enrich_many(_self: object, values: list[str], image_dir: Path) -> dict[str, EnrichedAsset]:
            raise RuntimeError("TMDb service unavailable")

        try:
            with patch("tierzo_api.main.TmdbMovieEnricher.enrich_many", fake_enrich_many):
                response = client.post(
                    "/packs",
                    json={
                        "text": "Alien\nThe Thing",
                        "preset": "arcade",
                        "size": 256,
                        "filename_mode": "both",
                        "title": "Movies",
                        "enrichment_mode": "tmdb_movie",
                    },
                )
        finally:
            if previous_key is None:
                os.environ.pop("TMDB_API_KEY", None)
            else:
                os.environ["TMDB_API_KEY"] = previous_key

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("error_fallback_text", body["enrichment_status"])
        manifest_body = client.get(body["manifest_url"]).json()
        self.assertEqual(manifest_body["items"][0]["asset_kind"], "text-card")

    def test_rejects_too_many_input_items(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/packs",
            json={
                "text": "\n".join(f"Item {i}" for i in range(201)),
                "preset": "arcade",
                "size": 256,
                "filename_mode": "both",
                "title": "Too Large",
            },
        )

        self.assertEqual(response.status_code, 413)
        body = response.json()
        self.assertIn("maximum is", body["detail"])

    def test_auto_agent_uses_typed_plan(self) -> None:
        previous_openai_key = os.environ.pop("OPENAI_API_KEY", None)
        previous_tmdb_key = os.environ.pop("TMDB_API_KEY", None)
        client = TestClient(app)

        try:
            response = client.post(
                "/packs",
                json={
                    "text": "Alien\nThe Thing",
                    "preset": "arcade",
                    "size": 256,
                    "filename_mode": "both",
                    "title": "Auto",
                    "enrichment_mode": "auto",
                    "agent_cache_refresh": True,
                },
            )
        finally:
            if previous_openai_key is not None:
                os.environ["OPENAI_API_KEY"] = previous_openai_key
            if previous_tmdb_key is not None:
                os.environ["TMDB_API_KEY"] = previous_tmdb_key

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body["agent_plan"])
        self.assertEqual(body["agent_plan"]["source"], "heuristic")
        self.assertEqual(body["agent_plan"]["tool"], "text")

    def test_generation_job_tracks_steps_and_returns_pack(self) -> None:
        client = TestClient(app)

        response = client.post(
            "/jobs",
            json={
                "text": "Mario\nLuigi",
                "preset": "clean",
                "size": 256,
                "filename_mode": "both",
                "title": "Job Smoke",
                "enrichment_mode": "text",
            },
        )

        self.assertEqual(response.status_code, 200)
        created = response.json()
        job_response = client.get(f"/jobs/{created['job_id']}")

        self.assertEqual(job_response.status_code, 200)
        job = job_response.json()
        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["pack"]["item_count"], 2)
        self.assertEqual(job["steps"][-1]["status"], "done")

    def test_asset_override_can_force_text_card(self) -> None:
        client = TestClient(app)
        fake_image = Path(".tierzo/test-source.jpg").resolve()
        fake_image.parent.mkdir(parents=True, exist_ok=True)
        fake_image.write_bytes(b"not-a-real-image-but-not-used")

        def fake_enrich_many(
            _self: object,
            values: list[str],
            image_dir: Path,
        ) -> dict[str, EnrichedAsset]:
            return {
                "Alien": EnrichedAsset(
                    query="Alien",
                    title="Alien",
                    source_type="tmdb",
                    source_value="348",
                    source_url="https://www.themoviedb.org/movie/348",
                    image_path=fake_image,
                    confidence=0.98,
                )
            }

        previous_key = os.environ.get("TMDB_API_KEY")
        os.environ["TMDB_API_KEY"] = "test"

        try:
            with patch("tierzo_api.main.TmdbMovieEnricher.enrich_many", fake_enrich_many):
                response = client.post(
                    "/packs",
                    json={
                        "text": "Alien",
                        "preset": "arcade",
                        "size": 256,
                        "filename_mode": "both",
                        "title": "Overrides",
                        "enrichment_mode": "tmdb_movie",
                        "asset_overrides": {"Alien": "text"},
                    },
                )
        finally:
            if previous_key is None:
                os.environ.pop("TMDB_API_KEY", None)
            else:
                os.environ["TMDB_API_KEY"] = previous_key

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["enrichment_status"], "tmdb_movie:0/1")
        self.assertEqual(body["items"][0]["asset_kind"], "text-card")

        manifest_body = client.get(body["manifest_url"]).json()
        self.assertEqual(manifest_body["enrichment"]["asset_overrides"], {"Alien": "text"})


if __name__ == "__main__":
    unittest.main()
