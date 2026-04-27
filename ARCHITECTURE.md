# Tierzo Architecture

Tierzo should be built as a modular product with a reusable core, a public web demo, an agentic backend, and an optional browser extension companion.

## Proposed Monorepo

```text
apps/
  web/          Next.js app for demo, preview, ranking, and export
  api/          FastAPI service for generation, agent workflows, and enrichers
  extension/    Chrome extension companion for TierMaker workflows

packages/
  core/         Python package for parsing, tile rendering, manifests, and ZIP export
  schemas/      Shared JSON schemas for packs, items, jobs, and agent results

docs/
  product and implementation notes
```

The current `generate_text_images.py` script is the prototype for `packages/core`.

## Major Components

### Core

The core package owns deterministic behavior:

- Parse input files and raw text.
- Normalize item names.
- Render image tiles.
- Apply style presets.
- Export ZIP files.
- Write manifests.
- Validate pack constraints.

The core should not depend on web framework code or agent runtime code.

### API

The API coordinates backend work:

- Accept uploads or pasted content.
- Create generation jobs.
- Call the core package.
- Run agentic extraction and enrichment.
- Store temporary artifacts.
- Return pack previews and download URLs.

FastAPI is the preferred backend because Python is already a strong fit for Excel parsing, image generation, AI orchestration, and file exports.

### Web App

The web app is the product surface:

- Paste/upload input.
- Preview normalized items.
- Review ambiguity.
- Show generated cards.
- Provide a drag-and-drop tier board.
- Export final tier-list PNG.
- Export TierMaker-ready ZIP.

Next.js is the preferred frontend because the project needs a deployable demo, strong routing, shareable pages, and a polished React interface.

### Agent

The agent should sit above deterministic tools:

```text
Input -> classify -> extract candidates -> choose tools -> enrich -> ask user when unsure -> produce pack plan
```

The agent may use:

- Structured outputs for predictable JSON.
- Tool calls for source APIs.
- Tracing for debugging decisions.
- Evals for ambiguous and messy inputs.

Agent output should always be represented as typed data before it affects rendering or export.

### Enrichers

Enrichers are source-specific modules:

- Search by item name.
- Return candidate matches.
- Include confidence and source metadata.
- Provide usable image URLs when available.
- Avoid hiding ambiguity from the user.

Initial candidates include TMDb, RAWG, Steam, AniList, Spotify, PokéAPI, and Wikidata.

### Chrome Extension

The extension is a companion, not the core product:

- Detect supported TierMaker pages.
- Read or receive Tierzo pack manifests.
- Guide upload batches.
- Fill safe user-visible fields when possible.
- Avoid reverse-engineered private APIs.

Browser file input restrictions may limit true one-click upload, so the extension should start as guided assistance.

## Data Model Sketch

```json
{
  "pack": {
    "id": "example-pack",
    "title": "Example Pack",
    "items": [
      {
        "id": "001",
        "name": "Example Item",
        "filename": "001-example-item.png",
        "status": "ready",
        "confidence": 0.92,
        "source": {
          "type": "text",
          "url": null
        },
        "asset": {
          "kind": "text-card",
          "width": 1024,
          "height": 1024
        }
      }
    ]
  }
}
```

## Key Constraints

- Basic generation must work without AI.
- AI output must be validated before use.
- External API enrichers must degrade gracefully.
- Generated assets should preserve source credits where relevant.
- TierMaker integration should stay compatible and user-mediated.
- Long-running generation should become job-based before public traffic.

## Deployment Direction

Initial deployment can be split:

- Web: Vercel.
- API: Railway, Fly.io, Render, or another Python-friendly host.
- Temporary storage: local filesystem for development, object storage later.
- Background jobs: synchronous first, queue later when batches become slow.
