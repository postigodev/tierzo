from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path("apps/api").resolve()))

from tierzo_api.main import app  # noqa: E402


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
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["item_count"], 2)
        self.assertEqual(body["description"], "Smoke description")
        self.assertEqual(body["row_labels"], ["God", "Good", "Ok"])
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


if __name__ == "__main__":
    unittest.main()
