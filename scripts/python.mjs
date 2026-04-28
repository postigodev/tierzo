import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const candidates = [
  process.env.PYTHON,
  "python",
  "python3",
  "py",
  ...findWindowsStorePython(),
].filter(Boolean);

const python = candidates.find((candidate) => {
  const result = spawnSync(candidate, ["--version"], {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
});

if (!python) {
  console.error(
    "Tierzo could not find Python. Set PYTHON to your python.exe path, or add Python 3.10+ to PATH.",
  );
  process.exit(1);
}

const result = spawnSync(python, args, {
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);

function findWindowsStorePython() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) {
    return [];
  }

  const base = join(process.env.LOCALAPPDATA, "Python");
  if (!existsSync(base)) {
    return [];
  }

  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("pythoncore-"))
      .map((entry) => join(base, entry.name, "python.exe"))
      .filter((path) => existsSync(path));
  } catch {
    return [];
  }
}
