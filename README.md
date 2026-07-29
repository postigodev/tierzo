# Tierzo

Tierzo is an open-source, agentic tier-list asset generator. It turns messy lists, spreadsheets, links, and prompts into polished image packs, tier-board previews, and TierMaker-ready exports.

The current version includes a reusable Python core, a CLI, a FastAPI backend, a Next.js demo, text-card/card-lab rendering, job-based generation, TMDb movie poster enrichment, Review Matches, ZIP export, and `manifest.json` generation.

## What Works Today

- Read `.txt`, `.csv`, and `.xlsx` inputs.
- Use the first column from CSV/XLSX files.
- Generate one square PNG per item.
- Auto-fit and wrap long text.
- Use basic visual presets.
- Tune cards in the web Card Lab.
- Run generation as observable jobs.
- Use Auto Agent with OpenAI when configured or deterministic planning when it
  is not.
- Draft from an explicit comma-, semicolon-, or newline-separated list without
  AI; open-ended prompts require `OPENAI_API_KEY`.
- Optionally enrich movie lists with TMDb posters.
- Review matches, force specific items back to text cards, and regenerate.
- Write a portable `manifest.json`.
- Export a TierMaker extension payload JSON.
- Export a final tier-board PNG from the web demo.
- Export a ZIP bundle.
- Keep the legacy Excel script available under `examples/`.

## Quick Start

Use Python 3.10+ and pnpm.

```powershell
python -m pip install -e .
pnpm install
```

Run the full local demo from the repo root:

```powershell
pnpm dev
```

This starts:

- FastAPI on `http://localhost:8000`
- Next.js on `http://localhost:3000`

Run checks from root:

```powershell
pnpm verify
```

Useful aliases:

```powershell
pnpm dev:api
pnpm dev:web
pnpm test
pnpm lint
pnpm build
pnpm demo:verify
```

Install dependencies directly for the legacy script if you are not using the package install:

```powershell
python -m pip install -r requirements.txt
```

## CLI Usage

Generate a pack from a text file:

```powershell
python -m tierzo .\items.txt
```

Generate a styled pack with slug filenames and a ZIP:

```powershell
python -m tierzo .\items.txt --preset arcade --filename-mode both --zip
```

Generate from Excel:

```powershell
python -m tierzo .\items.xlsx
```

Choose output folder and image size:

```powershell
python -m tierzo .\items.csv --output .\output --size 768
```

## Presets

Available text-card presets:

- `clean`
- `dark`
- `arcade`
- `bubblegum`
- `hero-hud`
- `mono-soul`
- `creature-dex`
- `cyber-mint`
- `blood-moon`

Example:

```powershell
python -m tierzo .\items.txt --preset bubblegum
```

## Filename Modes

Use `--filename-mode` to choose generated image names:

- `index`: `001.png`
- `slug`: `princess-peach.png`
- `both`: `003-princess-peach.png`

Example:

```powershell
python -m tierzo .\items.txt --filename-mode both
```

## Output

For an input file named `items.txt`, Tierzo creates `items_tierzo` by default:

```text
items_tierzo/
  001.png
  002.png
  003.png
  manifest.json
```

With `--zip`, Tierzo also creates:

```text
items_tierzo.zip
```

## Legacy Excel Script

The original prototype is preserved for reference:

```powershell
python .\examples\generate_text_images.py .\items.xlsx
```

It reads the first worksheet, takes every non-empty value from column A, and generates numbered PNGs. Prefer the modern CLI for new workflows:

```powershell
python -m tierzo .\items.xlsx --zip
```

## Repo Layout

```text
apps/
  api/      FastAPI app and API workspace scripts
  web/      Next.js demo app
docs/       Product, roadmap, architecture, demo, extension, open-core notes
examples/   Legacy/reference scripts and sample-oriented code
scripts/    Repo helper scripts for Python discovery and local dev
src/        Python package and CLI core
tests/      Python unit/API tests
```

Root is intentionally kept for entrypoints and tooling: `README.md`, `AGENTS.md`, `LICENSE`, package configs, Python configs, and env examples.

## Product Direction

Tierzo is heading toward:

- A deployable Next.js demo with paste/upload and shareable artifacts.
- A tier-board preview with drag-and-drop ranking and final PNG export.
- TierMaker-ready ZIP batches plus extension-guided workflows.
- Agentic list cleanup, entity resolution, and user-visible trace/review.
- API enrichers for movies, games, anime, music, and more.
- A provider/plugin contract where TMDb, Steam, Spotify, and future tools return comparable matches.
- A Chrome extension companion for guided TierMaker workflows.

## Demo App

The first web demo lives in `apps/web` and talks to the FastAPI service in `apps/api`.

Optional agentic planning uses OpenAI and optional movie poster enrichment uses
TMDb. Without keys, Auto and text-card generation remain available. Describe
can deterministically clean up an explicit list, while open-ended prompts that
require Tierzo to invent items need OpenAI. Movie posters remains visible but
disabled when TMDb is not configured.

The API publishes this configuration through `GET /capabilities`. Successful
fallbacks return `outcome: "degraded"` with structured warnings instead of
being presented as total generation failures.

```powershell
$env:OPENAI_API_KEY="your_openai_api_key"
$env:TMDB_API_KEY="your_tmdb_api_key"
```

You can also put it in a local root `.env` file:

```text
OPENAI_API_KEY=your_openai_api_key
TMDB_API_KEY=your_tmdb_api_key
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For production, set the deployed frontend origin in `FRONTEND_URL` so FastAPI only allows that domain.

Run both services:

```powershell
pnpm dev
```

Open:

```text
http://localhost:3000
```

Verify the running demo with Playwright:

```powershell
# in another terminal, keep pnpm dev running first
pnpm demo:verify
```

Read more:

- [Product brief](docs/PRODUCT.md)
- [Demo plan](docs/DEMO.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Browser extension contract](docs/EXTENSION.md)
- [Open-core model](docs/OPEN_CORE.md)

## Development

Install locally:

```powershell
python -m pip install -e .
```

Run the CLI:

```powershell
python -m tierzo --help
```

Run tests:

```powershell
pnpm test
```

Generated files are ignored by git when they use the default `*_tierzo`, `*_images`, `.tierzo`, or `.zip` paths.

## License

Tierzo is released under the [MIT License](LICENSE).
