from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock, call, patch

from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
from openpyxl import Workbook
from PIL import Image

sys.path.append(str(Path("apps/api").resolve()))

from tierzo_api.main import app  # noqa: E402
from tierzo_api.lifecycle import PackLifecycleRegistry  # noqa: E402
from tierzo_api import main as api_main  # noqa: E402
from tierzo.agentic import IntakePlan, PromptDraft  # noqa: E402
from tierzo.enrichers import EnrichedAsset  # noqa: E402


class TierzoApiTests(unittest.TestCase):
    timestamp_pattern = re.compile(
        r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$"
    )

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

    def create_xlsx_bytes(self, rows: list[list[object]]) -> bytes:
        output = BytesIO()
        workbook = Workbook()
        worksheet = workbook.active
        for row in rows:
            worksheet.append(row)
        workbook.save(output)
        workbook.close()
        return output.getvalue()

    def test_file_intake_reads_txt(self) -> None:
        response = TestClient(app).post(
            "/intakes/files",
            files={"file": ("../Movies.TXT", b"Alien\nAliens\nAlien\n", "text/plain")},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "schema_version": "tierzo.file-intake.v1",
                "filename": "Movies.TXT",
                "format": "txt",
                "items": ["Alien", "Aliens", "Alien"],
                "item_count": 3,
                "interpretation": "Imported non-empty lines; the first value was preserved.",
            },
        )

    def test_file_intake_reads_csv_and_collapses_multiline_cells(self) -> None:
        response = TestClient(app).post(
            "/intakes/files",
            files={
                "file": (
                    "movies.csv",
                    b'"Alien\nAliens",movie\nArrival,movie\n',
                    "text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"], ["Alien Aliens", "Arrival"])
        self.assertIn("first column", response.json()["interpretation"])
        self.assertIn("whitespace", response.json()["interpretation"])

    def test_file_intake_reads_xlsx_first_sheet_and_column(self) -> None:
        response = TestClient(app).post(
            "/intakes/files",
            files={
                "file": (
                    "movies.xlsx",
                    self.create_xlsx_bytes(
                        [["Alien\nAliens", "ignored"], ["Arrival", "ignored"]]
                    ),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["format"], "xlsx")
        self.assertEqual(response.json()["items"], ["Alien Aliens", "Arrival"])
        self.assertIn("first worksheet", response.json()["interpretation"])

    def test_file_intake_rejects_unsupported_empty_and_invalid_text(self) -> None:
        client = TestClient(app)
        unsupported = client.post(
            "/intakes/files",
            files={"file": ("items.json", b"[]", "application/json")},
        )
        empty = client.post(
            "/intakes/files",
            files={"file": ("items.txt", b" \n\n", "text/plain")},
        )
        invalid_text = client.post(
            "/intakes/files",
            files={"file": ("items.txt", b"\xff\xfe", "text/plain")},
        )

        self.assertEqual(unsupported.status_code, 415)
        self.assertEqual(unsupported.json()["detail"]["code"], "unsupported_file_type")
        self.assertEqual(empty.status_code, 422)
        self.assertEqual(empty.json()["detail"]["code"], "empty_intake")
        self.assertEqual(invalid_text.status_code, 422)
        self.assertEqual(
            invalid_text.json()["detail"]["code"],
            "invalid_text_encoding",
        )

    def test_file_intake_rejects_size_item_count_and_item_length_limits(self) -> None:
        client = TestClient(app)
        with patch("tierzo_api.file_intake.MAX_INTAKE_FILE_BYTES", 5):
            oversized = client.post(
                "/intakes/files",
                files={"file": ("items.txt", b"123456", "text/plain")},
            )
        with patch.object(api_main, "MAX_LIST_ITEMS", 1):
            too_many = client.post(
                "/intakes/files",
                files={"file": ("items.txt", b"Alien\nAliens\n", "text/plain")},
            )
        too_long = client.post(
            "/intakes/files",
            files={"file": ("items.txt", b"a" * 201, "text/plain")},
        )

        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(oversized.json()["detail"], {
            "code": "file_too_large",
            "message": "File is too large; maximum is 5 bytes.",
            "limit": 5,
        })
        self.assertEqual(too_many.status_code, 413)
        self.assertEqual(too_many.json()["detail"]["code"], "too_many_items")
        self.assertEqual(too_long.status_code, 422)
        self.assertEqual(too_long.json()["detail"]["code"], "item_too_long")
        self.assertEqual(too_long.json()["detail"]["item_index"], 0)

    def test_file_intake_rejects_malformed_and_unsafe_xlsx(self) -> None:
        client = TestClient(app)
        malformed = client.post(
            "/intakes/files",
            files={"file": ("items.xlsx", b"not-a-zip", "application/octet-stream")},
        )
        archive = BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("xl/large.xml", "x" * 32)
        with patch("tierzo_api.file_intake.MAX_XLSX_UNCOMPRESSED_BYTES", 16):
            unsafe = client.post(
                "/intakes/files",
                files={"file": ("items.xlsx", archive.getvalue(), "application/octet-stream")},
            )

        self.assertEqual(malformed.status_code, 422)
        self.assertEqual(malformed.json()["detail"]["code"], "malformed_file")
        self.assertEqual(unsafe.status_code, 422)
        self.assertEqual(unsafe.json()["detail"]["code"], "unsafe_xlsx_archive")

    def test_file_intake_removes_temporary_file_after_success_and_error(self) -> None:
        client = TestClient(app)
        captured_paths: list[Path] = []

        def successful_parser(path: Path, **_: object) -> list[str]:
            captured_paths.append(path)
            self.assertTrue(path.exists())
            return ["Alien"]

        with patch("tierzo_api.file_intake.parse_input_file", side_effect=successful_parser):
            response = client.post(
                "/intakes/files",
                files={"file": ("items.txt", b"Alien", "text/plain")},
            )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(captured_paths[-1].exists())

        def failing_parser(path: Path, **_: object) -> list[str]:
            captured_paths.append(path)
            self.assertTrue(path.exists())
            raise ValueError("broken parser")

        with patch("tierzo_api.file_intake.parse_input_file", side_effect=failing_parser):
            response = client.post(
                "/intakes/files",
                files={"file": ("items.txt", b"Alien", "text/plain")},
            )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "malformed_file")
        self.assertFalse(captured_paths[-1].exists())

    def test_capabilities_describe_configured_and_deterministic_paths(self) -> None:
        client = TestClient(app)
        with patch.dict(os.environ, {}, clear=True):
            unconfigured = client.get("/capabilities")
        with patch.dict(
            os.environ,
            {"OPENAI_API_KEY": "openai", "TMDB_API_KEY": "tmdb"},
            clear=True,
        ):
            configured = client.get("/capabilities")

        self.assertEqual(unconfigured.status_code, 200)
        body = unconfigured.json()
        self.assertEqual(body["schema_version"], "tierzo.capabilities.v1")
        self.assertEqual(
            body["capabilities"]["text_cards"]["effective_mode"],
            "deterministic",
        )
        self.assertEqual(
            body["capabilities"]["prompt_drafting"]["effective_mode"],
            "heuristic",
        )
        self.assertEqual(
            body["capabilities"]["tmdb_movie"]["reason_code"],
            "tmdb_unconfigured",
        )
        self.assertEqual(
            configured.json()["capabilities"]["prompt_drafting"]["effective_mode"],
            "openai",
        )
        self.assertEqual(
            configured.json()["capabilities"]["tmdb_movie"]["effective_mode"],
            "tmdb",
        )
        with patch.dict(
            os.environ,
            {"OPENAI_API_KEY": "   ", "TMDB_API_KEY": "   "},
            clear=True,
        ):
            whitespace = client.get("/capabilities").json()
        self.assertEqual(
            whitespace["capabilities"]["prompt_drafting"]["effective_mode"],
            "heuristic",
        )
        self.assertFalse(
            whitespace["capabilities"]["tmdb_movie"]["available"],
        )

    def test_prompt_draft_uses_structured_heuristic_fallback_without_openai(
        self,
    ) -> None:
        client = TestClient(app)
        with patch.dict(os.environ, {}, clear=True):
            response = client.post(
                "/prompt-drafts",
                json={"prompt": "Rank these: Alien, Aliens, Arrival"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["items"], ["Alien", "Aliens", "Arrival"])
        self.assertEqual(body["source"], "heuristic")
        self.assertEqual(body["outcome"], "degraded")
        self.assertEqual(
            [warning["code"] for warning in body["warnings"]],
            ["openai_unconfigured_heuristic"],
        )
        self.assertEqual(body["suggested_enrichment_mode"], "auto")

    def test_prompt_draft_clamps_unavailable_tmdb_suggestion(self) -> None:
        client = TestClient(app)
        draft = PromptDraft(
            title="Movies",
            description=None,
            items=["Alien", "Aliens"],
            suggested_enrichment_mode="tmdb_movie",
            confidence=0.8,
            source="heuristic",
        )
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(api_main, "draft_prompt_to_tierlist", return_value=draft),
        ):
            response = client.post(
                "/prompt-drafts",
                json={"prompt": "Alien, Aliens"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["suggested_enrichment_mode"], "text")
        self.assertEqual(
            [warning["code"] for warning in response.json()["warnings"]],
            ["openai_unconfigured_heuristic", "tmdb_unconfigured_text_fallback"],
        )

    def test_prompt_draft_rejects_vague_prompt_without_openai(self) -> None:
        client = TestClient(app)
        with patch.dict(os.environ, {}, clear=True):
            response = client.post(
                "/prompt-drafts",
                json={"prompt": "best alien movies"},
            )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json()["detail"]["code"],
            "prompt_requires_explicit_items_without_ai",
        )

    def test_prompt_draft_reports_openai_provider_fallback(self) -> None:
        client = TestClient(app)
        fallback = PromptDraft(
            title="Fallback",
            description=None,
            items=["Alien", "Aliens"],
            suggested_enrichment_mode="text",
            confidence=0.55,
            source="heuristic",
        )
        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}, clear=True),
            patch.object(api_main, "draft_prompt_to_tierlist", return_value=fallback),
        ):
            response = client.post(
                "/prompt-drafts",
                json={"prompt": "Alien, Aliens"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["outcome"], "degraded")
        self.assertEqual(
            response.json()["warnings"][0]["code"],
            "openai_provider_heuristic_fallback",
        )

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
        self.assertEqual(pack["status"], "completed")
        self.assertRegex(str(pack["created_at"]), self.timestamp_pattern)
        self.assertRegex(str(pack["expires_at"]), self.timestamp_pattern)

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

    def test_failed_pack_generation_discards_only_allocated_artifacts(self) -> None:
        tierzo_test_dir = api_main.ROOT_DIR / ".tierzo"
        tierzo_test_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=tierzo_test_dir) as temporary_directory:
            storage_dir = Path(temporary_directory)
            registry = PackLifecycleRegistry(storage_dir)
            unrelated_dir = storage_dir / "unrelated-pack"
            unrelated_dir.mkdir()
            unrelated_file = unrelated_dir / "keep.txt"
            unrelated_file.write_text("keep", encoding="utf-8")
            unrelated_zip = storage_dir / "unrelated-pack.zip"
            unrelated_zip.write_bytes(b"keep")

            def fail_after_partial_write(
                _items: object,
                output_dir: Path,
                **_kwargs: object,
            ) -> None:
                output_dir.mkdir(parents=True)
                (output_dir / "partial.png").write_bytes(b"partial")
                (output_dir.parent / f"{output_dir.name}.zip").write_bytes(
                    b"partial"
                )
                raise RuntimeError("render failed")

            allocated_uuid = Mock(hex="allocated-pack")
            client = TestClient(app, raise_server_exceptions=False)
            with (
                patch.object(api_main, "STORAGE_DIR", storage_dir),
                patch.object(api_main, "PACK_LIFECYCLE_REGISTRY", registry),
                patch.object(api_main.uuid, "uuid4", return_value=allocated_uuid),
                patch.object(
                    api_main,
                    "generate_pack_from_items",
                    side_effect=fail_after_partial_write,
                ),
            ):
                response = client.post(
                    "/packs",
                    json={
                        "text": "Mario",
                        "preset": "clean",
                        "size": 256,
                        "filename_mode": "both",
                        "title": "Partial failure",
                        "enrichment_mode": "text",
                    },
                )

            self.assertEqual(response.status_code, 500)
            self.assertFalse((storage_dir / "allocated-pack").exists())
            self.assertFalse((storage_dir / "allocated-pack.zip").exists())
            self.assertEqual(unrelated_file.read_text(encoding="utf-8"), "keep")
            self.assertEqual(unrelated_zip.read_bytes(), b"keep")

    def test_cleanup_failure_never_masks_generation_error_or_skips_pack_ids(
        self,
    ) -> None:
        generation_error = RuntimeError("original generation failure")

        def allocate_then_fail(
            _payload: object,
            _progress_callback: object,
            allocated_pack_ids: list[str],
        ) -> None:
            allocated_pack_ids.extend(["first-pack", "second-pack"])
            raise generation_error

        with (
            patch.object(api_main, "_build_pack", side_effect=allocate_then_fail),
            patch.object(
                api_main.PACK_LIFECYCLE_REGISTRY,
                "discard",
                side_effect=[OSError("cleanup failed"), True],
            ) as discard,
        ):
            with self.assertRaises(RuntimeError) as raised:
                api_main.build_pack(Mock())

        self.assertIs(raised.exception, generation_error)
        self.assertEqual(
            discard.call_args_list,
            [call("first-pack"), call("second-pack")],
        )

    def test_discard_rejects_pack_id_path_traversal(self) -> None:
        tierzo_test_dir = api_main.ROOT_DIR / ".tierzo"
        tierzo_test_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=tierzo_test_dir) as temporary_directory:
            storage_dir = Path(temporary_directory) / "storage"
            storage_dir.mkdir()
            outside_file = Path(temporary_directory) / "outside.zip"
            outside_file.write_bytes(b"keep")
            registry = PackLifecycleRegistry(storage_dir)

            self.assertFalse(registry.discard("../outside"))
            self.assertEqual(outside_file.read_bytes(), b"keep")

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
        self.assertEqual(body["outcome"], "degraded")
        self.assertEqual(
            body["warnings"][0]["code"],
            "tmdb_unconfigured_text_fallback",
        )
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
        self.assertEqual(body["outcome"], "degraded")
        self.assertEqual(
            body["warnings"][0]["code"],
            "tmdb_provider_text_fallback",
        )
        manifest_body = client.get(body["manifest_url"]).json()
        self.assertEqual(manifest_body["items"][0]["asset_kind"], "text-card")

    def test_partial_tmdb_match_is_structured_degraded_success(self) -> None:
        client = TestClient(app)
        fake_image = Path(".tierzo/test-partial-source.png").resolve()
        fake_image.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (32, 32), "#ff0000").save(fake_image)
        self.addCleanup(fake_image.unlink, True)

        def fake_enrich_many(
            _self: object,
            _values: list[str],
            _image_dir: Path,
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

        with (
            patch.dict(os.environ, {"TMDB_API_KEY": "test"}, clear=True),
            patch("tierzo_api.main.TmdbMovieEnricher.enrich_many", fake_enrich_many),
        ):
            response = client.post(
                "/packs",
                json={
                    "text": "Alien\nThe Thing",
                    "title": "Partial",
                    "enrichment_mode": "tmdb_movie",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["outcome"], "degraded")
        self.assertEqual(
            response.json()["warnings"][0]["code"],
            "tmdb_partial_match",
        )

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
        self.assertEqual(body["outcome"], "degraded")
        self.assertEqual(
            body["warnings"][0]["code"],
            "openai_unconfigured_heuristic",
        )

    def test_auto_agent_resolves_unsupported_planner_tool_to_text(self) -> None:
        client = TestClient(app)
        plan = IntakePlan(
            domain="games",
            tool="steam",
            items=["Portal", "Half-Life"],
            confidence=0.9,
            questions=[],
            source="openai",
        )
        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}, clear=True),
            patch.object(api_main, "plan_intake", return_value=plan),
        ):
            response = client.post(
                "/packs",
                json={
                    "items": [
                        {"id": "portal", "name": "Portal"},
                        {"id": "half-life", "name": "Half-Life"},
                    ],
                    "title": "Unsupported planner",
                    "enrichment_mode": "auto",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["enrichment_status"], "text")
        self.assertEqual(response.json()["outcome"], "degraded")
        self.assertEqual(
            response.json()["warnings"][0]["code"],
            "unsupported_planner_tool_text_fallback",
        )

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
        self.assertEqual(job["pack"]["outcome"], "normal")
        self.assertEqual(job["pack"]["warnings"], [])
        self.assertEqual(job["steps"][-1]["status"], "done")

    def test_generation_job_uses_pending_and_running_with_utc_timestamps(self) -> None:
        registry = api_main.JobRegistry()
        client = TestClient(app)

        with (
            patch.object(api_main, "JOBS", registry),
            patch.object(BackgroundTasks, "add_task", return_value=None),
        ):
            created_response = client.post(
                "/jobs",
                json={"text": "Mario", "enrichment_mode": "text"},
            )
            created = created_response.json()
            pending = client.get(f"/jobs/{created['job_id']}").json()
            registry.mark_running(created["job_id"])
            running = client.get(f"/jobs/{created['job_id']}").json()

        self.assertEqual(created_response.status_code, 200)
        self.assertEqual(created["status"], "pending")
        self.assertEqual(pending["status"], "pending")
        self.assertEqual(running["status"], "running")
        self.assertRegex(pending["created_at"], self.timestamp_pattern)
        self.assertRegex(pending["updated_at"], self.timestamp_pattern)
        self.assertRegex(running["updated_at"], self.timestamp_pattern)
        self.assertIsNone(pending["pack_status"])

    def test_generation_job_failure_is_terminal_and_timestamped(self) -> None:
        registry = api_main.JobRegistry()
        client = TestClient(app)

        with (
            patch.object(api_main, "JOBS", registry),
            patch.object(
                api_main,
                "build_pack",
                side_effect=RuntimeError("render exploded"),
            ),
        ):
            created = client.post(
                "/jobs",
                json={"text": "Mario", "enrichment_mode": "text"},
            ).json()
            failed = client.get(f"/jobs/{created['job_id']}").json()

        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["error"], "Tierzo could not generate this pack.")
        self.assertRegex(failed["created_at"], self.timestamp_pattern)
        self.assertRegex(failed["updated_at"], self.timestamp_pattern)
        self.assertIsNone(failed["pack"])
        self.assertIsNone(failed["pack_status"])

    def test_unknown_generation_job_is_typed_lost(self) -> None:
        registry = api_main.JobRegistry()
        client = TestClient(app)
        with patch.object(api_main, "JOBS", registry):
            response = client.get("/jobs/unknown-job")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "job_id": "unknown-job",
                "status": "lost",
                "created_at": None,
                "updated_at": None,
                "steps": [],
                "pack": None,
                "pack_status": None,
                "error": None,
            },
        )

    def test_completed_job_preserves_success_when_pack_expires_or_is_lost(self) -> None:
        registry = api_main.JobRegistry()
        client = TestClient(app)

        with patch.object(api_main, "JOBS", registry):
            expired_created = client.post(
                "/jobs",
                json={
                    "text": "Mario",
                    "title": "Expired job pack",
                    "enrichment_mode": "text",
                },
            ).json()
            expired_before = client.get(
                f"/jobs/{expired_created['job_id']}"
            ).json()
            expired_pack_id = expired_before["pack"]["pack_id"]
            self.addCleanup(
                shutil.rmtree,
                api_main.STORAGE_DIR / expired_pack_id,
                True,
            )
            self.addCleanup(
                (api_main.STORAGE_DIR / f"{expired_pack_id}.zip").unlink,
                True,
            )
            self.expire_manifest(expired_pack_id)
            expired_after = client.get(
                f"/jobs/{expired_created['job_id']}"
            ).json()

            lost_created = client.post(
                "/jobs",
                json={
                    "text": "Luigi",
                    "title": "Lost job pack",
                    "enrichment_mode": "text",
                },
            ).json()
            lost_before = client.get(f"/jobs/{lost_created['job_id']}").json()
            lost_pack_id = lost_before["pack"]["pack_id"]
            self.addCleanup(
                shutil.rmtree,
                api_main.STORAGE_DIR / lost_pack_id,
                True,
            )
            lost_zip = api_main.STORAGE_DIR / f"{lost_pack_id}.zip"
            self.addCleanup(lost_zip.unlink, True)
            lost_zip.unlink()
            lost_after = client.get(f"/jobs/{lost_created['job_id']}").json()

        self.assertEqual(expired_before["pack_status"], "completed")
        self.assertEqual(expired_after["status"], "completed")
        self.assertEqual(expired_after["pack_status"], "expired")
        self.assertEqual(expired_after["pack"]["pack_id"], expired_pack_id)
        self.assertEqual(lost_before["pack_status"], "completed")
        self.assertEqual(lost_after["status"], "completed")
        self.assertEqual(lost_after["pack_status"], "lost")
        self.assertEqual(lost_after["pack"]["pack_id"], lost_pack_id)

    def test_generation_job_capacity_rejects_without_evicting_active_jobs(self) -> None:
        registry = api_main.JobRegistry(active_capacity=1)
        registry.admit("existing", api_main.default_job_steps())
        client = TestClient(app)

        with (
            patch.object(api_main, "JOBS", registry),
            patch.object(BackgroundTasks, "add_task", return_value=None),
        ):
            rejected = client.post(
                "/jobs",
                json={"text": "Mario", "enrichment_mode": "text"},
            )
            existing = client.get("/jobs/existing")

        self.assertEqual(rejected.status_code, 503)
        self.assertEqual(
            rejected.json()["detail"]["code"],
            "job_capacity_reached",
        )
        self.assertEqual(existing.status_code, 200)
        self.assertEqual(existing.json()["status"], "pending")

    def test_terminal_job_retention_and_capacity_are_bounded(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=UTC)
        current_time = [now]
        registry = api_main.JobRegistry(
            terminal_capacity=1,
            terminal_retention_seconds=10,
            clock=lambda: current_time[0],
        )

        registry.admit("first", api_main.default_job_steps())
        registry.mark_failed("first", "first failed")
        current_time[0] = now + timedelta(seconds=1)
        registry.admit("second", api_main.default_job_steps())
        registry.mark_failed("second", "second failed")

        self.assertIsNone(registry.get("first"))
        self.assertEqual(registry.get("second").status, "failed")

        current_time[0] = now + timedelta(seconds=10)
        self.assertEqual(registry.get("second").status, "failed")
        current_time[0] = now + timedelta(seconds=11)
        self.assertIsNone(registry.get("second"))

    def test_active_jobs_are_never_removed_by_terminal_cleanup(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=UTC)
        current_time = [now]
        registry = api_main.JobRegistry(
            active_capacity=2,
            terminal_capacity=0,
            terminal_retention_seconds=0,
            clock=lambda: current_time[0],
        )

        self.assertIsNotNone(
            registry.admit("pending", api_main.default_job_steps())
        )
        self.assertIsNotNone(
            registry.admit("running", api_main.default_job_steps())
        )
        registry.mark_running("running")
        current_time[0] = now + timedelta(days=365)

        self.assertEqual(registry.get("pending").status, "pending")
        self.assertEqual(registry.get("running").status, "running")
        self.assertIsNone(
            registry.admit("rejected", api_main.default_job_steps())
        )

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
        self.assertEqual(body["outcome"], "normal")
        self.assertEqual(body["warnings"], [])

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
