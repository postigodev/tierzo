# Tierzo

Tierzo is a reviewable tier-pack creation tool. It turns lists and prompts into
editable image packs, a rankable tier board, and portable exports. Basic pack
generation works locally without AI; OpenAI planning and TMDb movie posters are
optional accelerators.

## What Works Today

- Import `.txt`, `.csv`, and `.xlsx` lists in the CLI or web app, or paste a
  list directly into the web workspace.
- Edit source items before generation and preserve compatible item identity and
  rankings across reorder, rename, add, remove, and regeneration operations.
- Generate square text cards with presets, fitted text, stable filenames, and
  Card Lab styling in the web app.
- Draft explicit lists deterministically or use OpenAI for open-ended prompts.
- Optionally enrich movie items with TMDb posters, review source/confidence
  metadata, force matches back to text cards, and regenerate.
- Rank generated cards on an editable tier board.
- Export a board PNG, asset ZIP, `manifest.json`, and a TierMaker compatibility
  payload.
- Observe generation through bounded background jobs and recover an editable
  browser workspace when temporary server artifacts expire or disappear.

## Requirements

- Python 3.10+
- pnpm 10 (the repository declares the exact package-manager version)

## Quick Start

```powershell
python -m pip install -e .
pnpm install
pnpm dev
```

This starts FastAPI at `http://localhost:8000` and Next.js at
`http://localhost:3000`.

Run the repository checks with:

```powershell
pnpm verify
```

Useful commands:

```powershell
pnpm dev:api
pnpm dev:web
pnpm test
pnpm lint
pnpm build
pnpm demo:verify
```

`pnpm demo:verify` expects `pnpm dev` to be running in another terminal.

## CLI

Generate a pack from TXT, CSV, or XLSX:

```powershell
python -m tierzo .\items.txt
python -m tierzo .\items.csv --output .\output --size 768
python -m tierzo .\items.xlsx --preset arcade --filename-mode both --zip
```

The CLI reads non-empty TXT lines, the first CSV column, or the first column of
the first XLSX worksheet. It does not infer or remove headers.

Filename modes are `index`, `slug`, and `both`. Text-card presets are `clean`,
`dark`, `arcade`, `bubblegum`, `hero-hud`, `mono-soul`, `creature-dex`,
`cyber-mint`, and `blood-moon`.

By default, `items.txt` produces:

```text
items_tierzo/
  001.png
  002.png
  manifest.json
```

Add `--zip` to create `items_tierzo.zip`.

## Web App

The web workspace supports paste, file intake, prompt drafting, source editing,
generation progress, match review, Card Lab styling, tier-board ranking, and
artifact downloads.

File intake is bounded and transactional: `.txt`, `.csv`, and `.xlsx` are
validated and parsed by the API; duplicates are retained; CSV/XLSX cell
whitespace is collapsed; and a rejected import leaves the current workspace
unchanged. A successful import replaces the editable source but requires
regeneration before the board and artifacts reflect it. Uploaded source files
are removed immediately after parsing.

Optional integrations are configured in a root `.env` file:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
TMDB_API_KEY=
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Without keys, text cards and deterministic handling of explicit lists remain
available. Open-ended prompts require OpenAI. TMDb movie posters are disabled
when `TMDB_API_KEY` is absent, and provider failures degrade to text cards with
visible warnings.

## Current Limitations

- Server jobs and generated packs use local, in-process storage. They are not
  durable across restarts and expire according to configured retention limits.
- The browser preserves editable workspace state in local storage, not as a
  cross-device account or permanent history.
- TMDb movie posters are the only built-in external enricher.
- Users can reject a match in favor of a text card, but richer candidate search
  and local/manual image ingestion are not implemented yet.
- TierMaker compatibility is export-only and user-mediated. Tierzo does not use
  private TierMaker APIs or submit on the user's behalf.
- The repository does not include a production deployment configuration.

## Repository Layout

```text
apps/api/      FastAPI service and job/artifact lifecycle
apps/web/      Next.js workspace and tier board
src/tierzo/    Deterministic Python core and CLI
tests/         Python core and API tests
examples/      Legacy/reference XLSX script and sample input
docs/          Canonical product and architecture contracts
```

The original XLSX prototype remains available for reference:

```powershell
python .\examples\generate_text_images.py .\items.xlsx
```

For product scope and v0.1 direction, read [Product](docs/PRODUCT.md). For
technical contracts and lifecycle semantics, read
[Architecture](docs/ARCHITECTURE.md).
