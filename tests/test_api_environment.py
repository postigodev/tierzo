from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.append(str(Path("apps/api").resolve()))

from tierzo_api.environment import load_env_file


class ApiEnvironmentTests(unittest.TestCase):
    def test_load_env_file_preserves_process_values_and_loads_missing_values(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "PACK_TTL_SECONDS=12",
                        "JOB_ACTIVE_CAPACITY='3'",
                        "EMPTY_PROCESS_VALUE=from-file",
                    ]
                ),
                encoding="utf-8",
            )
            environ = {
                "PACK_TTL_SECONDS": "99",
                "EMPTY_PROCESS_VALUE": "",
            }

            load_env_file(env_path, environ=environ)

            self.assertEqual(environ["PACK_TTL_SECONDS"], "99")
            self.assertEqual(environ["JOB_ACTIVE_CAPACITY"], "3")
            self.assertEqual(environ["EMPTY_PROCESS_VALUE"], "")

    def test_load_env_file_ignores_comments_and_malformed_lines(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            env_path.write_text(
                "# comment\n\nMALFORMED\nVALID=\"yes\"\n",
                encoding="utf-8",
            )
            environ: dict[str, str] = {}

            load_env_file(env_path, environ=environ)

            self.assertEqual(environ, {"VALID": "yes"})


if __name__ == "__main__":
    unittest.main()
