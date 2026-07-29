# Tierzo Architecture

Tierzo is a modular product with a deterministic Python core, a FastAPI backend, a public Next.js demo, agentic intake, source enrichers, and an optional browser extension companion.

The architecture optimizes for demoable slices. A feature is more valuable when it can be seen, reviewed, exported, or shared from the web demo.

## Current Monorepo

```text
apps/
  api/          FastAPI service for generation, jobs, agent workflows, and enrichers
  web/          Next.js app for demo, preview, ranking, and export
docs/           Product and implementation notes
examples/       Legacy/reference scripts
scripts/        Repo helper scripts
src/tierzo/     Python package for parsing, rendering, enrichment, manifests, ZIPs, and CLI
tests/          Unit and API tests
```

The original XLSX prototype is preserved at `examples/generate_text_images.py`. New work should use the tested `src/tierzo` package, CLI, API, and web demo.

## Core

The core package owns deterministic behavior:

- Parse raw text, TXT, CSV, and XLSX files.
- Render text cards and image cards.
- Apply style presets and Card Lab custom styles.
- Export ZIP files.
- Write portable manifests with source metadata.
- Validate pack constraints.

The core should not depend on web framework code or agent runtime code.

## API

The API coordinates backend work:

- Accept pasted content.
- Create observable generation jobs.
- Call the core package.
- Run agentic extraction and enrichment.
- Cache agentic intake plans.
- Expose match/source metadata to the frontend.
- Accept user overrides such as forcing an item back to a text card.
- Store temporary artifacts under `.tierzo`.
- Return pack previews, manifests, ZIPs, and extension payloads.

FastAPI remains the preferred backend because Python fits Excel parsing, image generation, AI orchestration, and file exports.

## Web App

The web app is the product surface:

- Paste input.
- Edit title, description, tier labels, and card style.
- Show live generation progress from job steps.
- Review source matches and apply simple human overrides.
- Drag cards through a tier board.
- Export final tier-list PNG.
- Export ZIP, manifest, and TierMaker extension JSON.

Next.js remains the preferred frontend because the project needs a deployable demo, strong React ergonomics, and a polished product surface.

The first screen should be the usable generator experience, not a marketing hero. See `docs/DEMO.md` for visual and interaction requirements.

## Agent

The agent sits above deterministic tools:

```text
Input -> classify -> extract candidates -> choose tool -> enrich -> ask/review -> produce pack
```

Current agentic intake returns typed plans with `domain`, `tool`, `items`, `confidence`, questions, source, and cache metadata. Agent output must be represented as typed data before it affects rendering or export.

The strongest near-term goal is not “fully autonomous everything”. It is transparent automation:

- Show what the agent thought the list was.
- Show which tool it picked.
- Show which matches it found.
- Let the user correct suspicious items.

## Enrichers

Enrichers are source-specific modules:

- Search by item name.
- Return candidate matches.
- Include confidence and source metadata.
- Provide usable image URLs or downloaded images.
- Degrade gracefully to text cards.
- Avoid hiding ambiguity from the user.

Current first connector:

- TMDb movie posters.

Likely next connectors:

- Steam for games.
- Spotify for albums, tracks, and artists.
- AniList for anime.
- RAWG, PokéAPI, Wikidata, or link/image sources later.

## Chrome Extension

The extension is a companion, not the core product:

- Detect supported TierMaker pages.
- Read or receive Tierzo pack manifests.
- Guide upload batches.
- Fill safe user-visible fields when possible.
- Avoid reverse-engineered private APIs.

Browser file input restrictions may limit true one-click upload, so the extension should start as guided assistance.

## Data Model Sketch

Item IDs are workspace-scoped, opaque identities that survive regeneration;
see [Item Identity And Reconciliation](IDENTITY.md) for compatibility and
migration semantics.

```json
{
  "pack": {
    "id": "example-pack",
    "title": "Example Pack",
    "items": [
      {
        "id": "001",
        "name": "Alien",
        "filename": "001-alien.png",
        "status": "ready",
        "asset_kind": "image-card",
        "source_type": "tmdb",
        "source_value": "348",
        "source_url": "https://www.themoviedb.org/movie/348",
        "confidence": 0.98,
        "width": 1024,
        "height": 1024
      }
    ],
    "enrichment": {
      "mode": "auto",
      "resolved_mode": "tmdb_movie",
      "asset_overrides": {
        "Ambiguous Item": "text"
      }
    }
  }
}
```

## Key Constraints

- Basic generation must work without AI.
- AI output must be validated before use.
- External API enrichers must degrade gracefully.
- Generated assets should preserve source credits where relevant.
- TierMaker integration should stay compatible and user-mediated.
- Long-running generation should remain job-based and observable before public traffic.

## Deployment Direction

Initial deployment can be split:

- Web: Vercel.
- API: Railway, Fly.io, Render, or another Python-friendly host.
- Temporary storage: local filesystem for development, object storage later.
- Background jobs: synchronous first, queue later when batches become slow.
