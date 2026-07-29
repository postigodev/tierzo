from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

sys.path.append(str(Path("apps/api").resolve()))

from tierzo_api.main import app  # noqa: E402
from tierzo_api.lifecycle import PackLifecycleRegistry  # noqa: E402
from tierzo_api import main as api_main  # noqa: E402
from tierzo.agentic import IntakePlan  # noqa: E402
from tierzo.enrichers import EnrichedAsset  # noqa: E402


class TierzoApiTests(unittest.TestCase):
    def create_text_pack(self, client: TestClient, title: str) -> dict[str, object]:
        response = client.post(
            "/packs",
            json={
                "text": "Mario\nLuigi",
                "preset": "clean",
                "size": 256,
                "filename_mode": "both",
                "title": title,
                "enrichment_mode": "text",
            },
        )
        self.assertEqual(response.status_code, 200)
        pack = response.json()
        pack_id = str(pack["pack_id"])

        def remove_pack_artifacts() -> None:
            shutil.rmtree(api_main.STORAGE_DIR / pack_id, ignore_errors=True)
            (api_main.STORAGE_DIR / f"{pack_id}.zip").unlink(missing_ok=True)

        self.addCleanup(remove_pack_artifacts)
        return pack

    def expire_manifest(self, pack_id: str) -> Path:
        manifest_path = api_main.STORAGE_DIR / pack_id / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["created_at"] = "2025-01-01T00:00:00Z"
        manifest["expires_at"] = "2025-01-01T01:00:00Z"
        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return manifest_path

    def test_pack_status_is_completed_or_lost_with_utc_timestamps(self) -> None:
        client = TestClient(app)
        pack = self.create_text_pack(client, "Lifecycle completed")
        pack_id = str(pack["pack_id"])
        timestamp_pattern = re.compile(
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$"
        )

        self.assertEqual(pack["status"], "completed")
        self.assertRegex(str(pack["created_at"]), timestamp_pattern)
        self.assertRegex(str(pack["expires_at"]), timestamp_pattern)

        manifest_path = api_main.STORAGE_DIR / pack_id / "manifest.json"
        original_mtime_ns = manifest_path.stat().st_mtime_ns
        status_response = client.get(f"/packs/{pack_id}/status")
        lost_response = client.get("/packs/unknown-pack/status")

        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(
            status_response.json(),
            {
                "pack_id": pack_id,
                "status": "completed",
                "created_at": pack["created_at"],
                "expires_at": pack["expires_at"],
            },
        )
        self.assertEqual(manifest_path.stat().st_mtime_ns, original_mtime_ns)
        self.assertEqual(lost_response.status_code, 200)
        self.assertEqual(
            lost_response.json(),
            {
                "pack_id": "unknown-pack",
                "status": "lost",
                "created_at": None,
                "expires_at": None,
            },
        )

    def test_expired_pack_status_and_artifacts_use_structured_gone_error(self) -> None:
        client = TestClient(app)
        pack = self.create_text_pack(client, "Lifecycle expired")
        pack_id = str(pack["pack_id"])
        manifest_path = self.expire_manifest(pack_id)
        pack_dir = api_main.STORAGE_DIR / pack_id
        zip_path = api_main.STORAGE_DIR / f"{pack_id}.zip"
        manifest_before = manifest_path.read_bytes()
        manifest_mtime_before = manifest_path.stat().st_mtime_ns
        zip_before = zip_path.read_bytes()
        directory_before = sorted(path.name for path in pack_dir.iterdir())

        status_response = client.get(f"/packs/{pack_id}/status")
        artifact_response = client.get(str(pack["zip_url"]))

        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json()["status"], "expired")
        self.assertEqual(status_response.json()["created_at"], "2025-01-01T00:00:00Z")
        self.assertEqual(status_response.json()["expires_at"], "2025-01-01T01:00:00Z")
        self.assertEqual(artifact_response.status_code, 410)
        self.assertEqual(
            artifact_response.json()["detail"],
            {
                "code": "pack_expired",
                "resource": "zip",
                "status": "expired",
                "pack_id": pack_id,
                "created_at": "2025-01-01T00:00:00Z",
                "expires_at": "2025-01-01T01:00:00Z",
            },
        )
        self.assertTrue(pack_dir.is_dir())
        self.assertTrue(zip_path.is_file())
        self.assertEqual(manifest_path.read_bytes(), manifest_before)
        self.assertEqual(manifest_path.stat().st_mtime_ns, manifest_mtime_before)
        self.assertEqual(zip_path.read_bytes(), zip_before)
        self.assertEqual(
            sorted(path.name for path in pack_dir.iterdir()),
            directory_before,
        )

    def test_cleanup_deletes_expired_artifacts_and_retains_tombstone(self) -> None:
        client = TestClient(app)
        pack = self.create_text_pack(client, "Lifecycle cleanup")
        pack_id = str(pack["pack_id"])
        self.expire_manifest(pack_id)
        pack_dir = api_main.STORAGE_DIR / pack_id
        zip_path = api_main.STORAGE_DIR / f"{pack_id}.zip"

        api_main.cleanup_expired_storage()

        self.assertFalse(pack_dir.exists())
        self.assertFalse(zip_path.exists())
        status_response = client.get(f"/packs/{pack_id}/status")
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json()["status"], "expired")

    def test_required_artifact_loss_is_structured_and_shared_by_all_routes(self) -> None:
        client = TestClient(app)
        pack = self.create_text_pack(client, "Lifecycle lost")
        pack_id = str(pack["pack_id"])
        first_item = pack["items"][0]
        image_path = api_main.STORAGE_DIR / pack_id / str(first_item["filename"])
        image_path.unlink()

        responses = {
            "manifest": client.get(str(pack["manifest_url"])),
            "image": client.get(str(first_item["image_url"])),
            "zip": client.get(str(pack["zip_url"])),
            "extension": client.get(str(pack["extension_url"])),
        }

        for resource, response in responses.items():
            self.assertEqual(response.status_code, 404)
            detail = response.json()["detail"]
            self.assertEqual(detail["code"], "pack_lost")
            self.assertEqual(detail["resource"], resource)
            self.assertEqual(detail["status"], "lost")
            self.assertEqual(detail["pack_id"], pack_id)
            self.assertEqual(detail["created_at"], pack["created_at"])
            self.assertEqual(detail["expires_at"], pack["expires_at"])

    def test_expired_manifest_survives_registry_restart_as_evidence(self) -> None:
        client = TestClient(app)
        pack = self.create_text_pack(client, "Lifecycle restart")
        pack_id = str(pack["pack_id"])
        self.expire_manifest(pack_id)

        restarted_registry = PackLifecycleRegistry(api_main.STORAGE_DIR)
        lifecycle = restarted_registry.resolve(pack_id)

        self.assertEqual(lifecycle.status, "expired")
        self.assertEqual(lifecycle.created_at, "2025-01-01T00:00:00Z")
        self.assertEqual(lifecycle.expires_at, "2025-01-01T01:00:00Z")

    def test_malformed_lifecycle_metadata_is_lost_not_expired(self) -> None:
        client = TestClient(app)
        pack = self.create_text_pack(client, "Lifecycle malformed")
        pack_id = str(pack["pack_id"])
        manifest_path = api_main.STORAGE_DIR / pack_id / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["expires_at"] = "yesterday"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        status_response = client.get(f"/packs/{pack_id}/status")

        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json()["status"], "lost")
        self.assertIsNone(status_response.json()["created_at"])
        self.assertIsNone(status_response.json()["expires_at"])

    def test_structurally_malformed_manifests_are_lost(self) -> None:
        tierzo_test_dir = api_main.ROOT_DIR / ".tierzo"
        tierzo_test_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=tierzo_test_dir) as temporary_directory:
            storage_dir = Path(temporary_directory)
            now = datetime(2026, 1, 1, tzinfo=UTC)
            registry = PackLifecycleRegistry(storage_dir, clock=lambda: now)
            valid_manifest = {
                "title": "Valid",
                "created_at": "2025-12-31T23:00:00Z",
                "expires_at": "2026-01-01T01:00:00Z",
                "items": [
                    {
                        "id": "item-1",
                        "name": "Item",
                        "filename": "001-item.png",
                    }
                ],
            }

            mutations = {
                "missing-title": lambda manifest: manifest.pop("title"),
                "items-not-list": lambda manifest: manifest.update(items={}),
                "missing-id": lambda manifest: manifest["items"][0].pop("id"),
                "missing-name": lambda manifest: manifest["items"][0].pop("name"),
                "missing-filename": lambda manifest: manifest["items"][0].pop(
                    "filename"
                ),
                "unsafe-filename": lambda manifest: manifest["items"][0].update(
                    filename="../escape.png"
                ),
            }

            for pack_id, mutate in mutations.items():
                manifest = json.loads(json.dumps(valid_manifest))
                mutate(manifest)
                pack_dir = storage_dir / pack_id
                pack_dir.mkdir()
                (pack_dir / "001-item.png").write_bytes(b"image")
                (storage_dir / f"{pack_id}.zip").write_bytes(b"zip")
                (pack_dir / "manifest.json").write_text(
                    json.dumps(manifest),
                    encoding="utf-8",
                )

                with self.subTest(pack_id=pack_id):
                    self.assertEqual(registry.resolve(pack_id).status, "lost")

    def test_malformed_manifest_never_reaches_extension_rendering(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        pack = self.create_text_pack(client, "Lifecycle invalid extension")
        pack_id = str(pack["pack_id"])
        manifest_path = api_main.STORAGE_DIR / pack_id / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["items"][0].pop("name")
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        status_response = client.get(f"/packs/{pack_id}/status")
        extension_response = client.get(str(pack["extension_url"]))

        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json()["status"], "lost")
        self.assertEqual(extension_response.status_code, 404)
        self.assertEqual(extension_response.json()["detail"]["code"], "pack_lost")

    def test_concurrent_cleanup_and_resolution_keep_tombstones_bounded(self) -> None:
        tierzo_test_dir = api_main.ROOT_DIR / ".tierzo"
        tierzo_test_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=tierzo_test_dir) as temporary_directory:
            storage_dir = Path(temporary_directory)
            registry = PackLifecycleRegistry(
                storage_dir,
                tombstone_capacity=4,
                tombstone_retention_seconds=60,
            )
            pack_ids = [f"expired-{index}" for index in range(12)]
            for pack_id in pack_ids:
                pack_dir = storage_dir / pack_id
                pack_dir.mkdir()
                (pack_dir / "001-item.png").write_bytes(b"image")
                (storage_dir / f"{pack_id}.zip").write_bytes(b"zip")
                (pack_dir / "manifest.json").write_text(
                    json.dumps(
                        {
                            "title": "Expired",
                            "created_at": "2025-01-01T00:00:00Z",
                            "expires_at": "2025-01-01T01:00:00Z",
                            "items": [
                                {
                                    "id": "item",
                                    "name": "Item",
                                    "filename": "001-item.png",
                                }
                            ],
                        }
                    ),
                    encoding="utf-8",
                )

            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = [
                    executor.submit(registry.cleanup_expired)
                    for _ in range(8)
                ] + [
                    executor.submit(registry.resolve, pack_id)
                    for pack_id in pack_ids
                ]
                for future in futures:
                    future.result()

            expired_count = sum(
                registry.resolve(pack_id).status == "expired"
                for pack_id in pack_ids
            )
            self.assertLessEqual(expired_count, 4)

    def test_pack_tombstones_are_capacity_and_time_bounded(self) -> None:
        tierzo_test_dir = api_main.ROOT_DIR / ".tierzo"
        tierzo_test_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=tierzo_test_dir) as temporary_directory:
            storage_dir = Path(temporary_directory)
            now = datetime(2026, 1, 1, tzinfo=UTC)
            current_time = [now]
            registry = PackLifecycleRegistry(
                storage_dir,
                tombstone_capacity=1,
                tombstone_retention_seconds=10,
                clock=lambda: current_time[0],
            )

            def create_expired_pack(pack_id: str) -> None:
                pack_dir = storage_dir / pack_id
                pack_dir.mkdir()
                (pack_dir / "001-item.png").write_bytes(b"image")
                (storage_dir / f"{pack_id}.zip").write_bytes(b"zip")
                (pack_dir / "manifest.json").write_text(
                    json.dumps(
                        {
                            "created_at": "2025-01-01T00:00:00Z",
                            "expires_at": "2025-01-01T01:00:00Z",
                            "items": [{"filename": "001-item.png"}],
                        }
                    ),
                    encoding="utf-8",
                )

            create_expired_pack("first")
            create_expired_pack("second")
            self.assertEqual(registry.resolve("first").status, "expired")
            self.assertEqual(registry.resolve("second").status, "expired")
            self.assertTrue((storage_dir / "first").is_dir())
            self.assertTrue((storage_dir / "second").is_dir())

            registry.cleanup_expired()
            self.assertEqual(registry.resolve("first").status, "lost")
            self.assertEqual(registry.resolve("second").status, "expired")

            current_time[0] = now + timedelta(seconds=11)
            self.assertEqual(registry.resolve("second").status, "lost")

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

    def test_create_pack_from_structured_items_preserves_ids(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/packs",
            json={
                "items": [
                    {"id": "movie-alien", "name": "Alien"},
                    {"id": "movie-thing", "name": "The Thing"},
                ],
                "preset": "clean",
                "size": 256,
                "filename_mode": "both",
                "title": "Structured",
                "enrichment_mode": "text",
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            [item["id"] for item in body["items"]],
            ["movie-alien", "movie-thing"],
        )
        manifest = client.get(body["manifest_url"]).json()
        self.assertEqual(manifest["schema_version"], "tierzo.pack.v1")
        self.assertEqual(
            [item["id"] for item in manifest["items"]],
            ["movie-alien", "movie-thing"],
        )
        self.assertEqual(manifest["enrichment"]["item_asset_overrides"], {})
        extension = client.get(body["extension_url"]).json()
        self.assertEqual(
            [item["id"] for item in extension["batches"][0]["images"]],
            ["movie-alien", "movie-thing"],
        )

    def test_pack_requires_exactly_one_input_shape_and_unique_ids(self) -> None:
        client = TestClient(app)
        base = {
            "preset": "clean",
            "size": 256,
            "filename_mode": "both",
            "title": "Invalid",
        }

        neither = client.post("/packs", json=base)
        both = client.post(
            "/packs",
            json={
                **base,
                "text": "Alien",
                "items": [{"id": "alien", "name": "Alien"}],
            },
        )
        duplicates = client.post(
            "/packs",
            json={
                **base,
                "items": [
                    {"id": "alien", "name": "Alien"},
                    {"id": "alien", "name": "Aliens"},
                ],
            },
        )

        self.assertEqual(neither.status_code, 422)
        self.assertEqual(both.status_code, 422)
        self.assertEqual(duplicates.status_code, 422)

    def test_pack_rejects_ids_and_names_outside_the_browser_contract(self) -> None:
        client = TestClient(app)
        invalid_id = client.post(
            "/packs",
            json={"items": [{"id": "bad id", "name": "Alien"}]},
        )
        blank_name = client.post(
            "/packs",
            json={"items": [{"id": "alien", "name": "   "}]},
        )

        self.assertEqual(invalid_id.status_code, 422)
        self.assertEqual(blank_name.status_code, 422)

    def test_pack_rejects_invalid_filename_mode_during_validation(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/packs",
            json={"text": "Alien", "filename_mode": "unsafe"},
        )
        self.assertEqual(response.status_code, 422)

    def test_structured_override_targets_duplicate_by_id(self) -> None:
        client = TestClient(app)
        fake_image = Path(".tierzo/test-structured-source.jpg").resolve()
        fake_image.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (32, 32), "#ff0000").save(fake_image)

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
                        "items": [
                            {"id": "alien-a", "name": "Alien"},
                            {"id": "alien-b", "name": "Alien"},
                        ],
                        "preset": "clean",
                        "size": 256,
                        "filename_mode": "both",
                        "title": "Duplicate overrides",
                        "enrichment_mode": "tmdb_movie",
                        "item_asset_overrides": {
                            "alien-b": {"action": "text"},
                        },
                    },
                )
        finally:
            if previous_key is None:
                os.environ.pop("TMDB_API_KEY", None)
            else:
                os.environ["TMDB_API_KEY"] = previous_key

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            [item["asset_kind"] for item in body["items"]],
            ["image-card", "text-card"],
        )
        manifest = client.get(body["manifest_url"]).json()
        self.assertEqual(
            manifest["enrichment"]["item_asset_overrides"],
            {"alien-b": {"action": "text"}},
        )

    def test_structured_input_rejects_unknown_override_id(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/packs",
            json={
                "items": [{"id": "alien", "name": "Alien"}],
                "item_asset_overrides": {"missing": {"action": "text"}},
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_structured_auto_plan_does_not_replace_authoritative_items(self) -> None:
        client = TestClient(app)
        fake_plan = IntakePlan(
            domain="movies",
            tool="text",
            items=["Replacement"],
            confidence=0.9,
            questions=[],
            source="test",
        )
        with patch("tierzo_api.main.plan_intake", return_value=fake_plan):
            response = client.post(
                "/packs",
                json={
                    "items": [
                        {"id": "alien", "name": "Alien"},
                        {"id": "thing", "name": "The Thing"},
                    ],
                    "enrichment_mode": "auto",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(item["id"], item["name"]) for item in response.json()["items"]],
            [("alien", "Alien"), ("thing", "The Thing")],
        )

    def test_generation_job_accepts_structured_items(self) -> None:
        client = TestClient(app)
        created = client.post(
            "/jobs",
            json={
                "items": [
                    {"id": "mario", "name": "Mario"},
                    {"id": "luigi", "name": "Luigi"},
                ],
                "enrichment_mode": "text",
            },
        )

        self.assertEqual(created.status_code, 200)
        job = client.get(f"/jobs/{created.json()['job_id']}").json()
        self.assertEqual(job["status"], "completed")
        self.assertEqual(
            [item["id"] for item in job["pack"]["items"]],
            ["mario", "luigi"],
        )


if __name__ == "__main__":
    unittest.main()
