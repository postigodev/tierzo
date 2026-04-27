# Tierzo

Tierzo is an open-source, agentic tier-list asset generator. It turns messy lists, spreadsheets, and eventually links or prompts into polished image packs, tier-board previews, and TierMaker-ready exports.

The current version is the first technical foundation: a reusable Python core, a CLI, text-card presets, ZIP export, and `manifest.json` generation.

## What Works Today

- Read `.txt`, `.csv`, and `.xlsx` inputs.
- Use the first column from CSV/XLSX files.
- Generate one square PNG per item.
- Auto-fit and wrap long text.
- Use basic visual presets.
- Write a portable `manifest.json`.
- Export a ZIP bundle.
- Keep the legacy Excel script working.

## Install

Use Python 3.10 or newer.

```powershell
python -m pip install -e .
```

Or install dependencies directly for the legacy script:

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

The original command still works:

```powershell
python generate_text_images.py .\items.xlsx
```

It reads the first worksheet, takes every non-empty value from column A, and generates numbered PNGs.

## Product Direction

Tierzo is heading toward:

- A Next.js web demo with paste/upload.
- A tier-board preview with drag-and-drop ranking.
- Final PNG export.
- TierMaker-ready ZIP batches.
- Agentic list cleanup and entity resolution.
- API enrichers for movies, games, anime, music, and more.
- A Chrome extension companion for guided TierMaker workflows.

## Demo App

The first web demo lives in `apps/web` and talks to the FastAPI service in `apps/api`.

Run the API:

```powershell
pnpm api:dev
```

Run the web app in another terminal:

```powershell
pnpm web:dev
```

Open:

```text
http://localhost:3000
```

Verify the running demo with Playwright:

```powershell
pnpm demo:verify
```

Read more:

- [Product brief](PRODUCT.md)
- [Demo plan](DEMO.md)
- [Roadmap](ROADMAP.md)
- [Architecture](ARCHITECTURE.md)
- [Browser extension contract](EXTENSION.md)
- [Open-core model](OPEN_CORE.md)

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
python -m unittest discover -s tests
```

Generated files are ignored by git when they use the default `*_tierzo`, `*_images`, `.tierzo`, or `.zip` paths.
