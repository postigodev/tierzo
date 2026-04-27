# Tierzo Roadmap

This roadmap favors visible demos, useful exports, and stable primitives over broad platform scope.

## Phase 0: Product Foundation

- Define product direction and non-goals.
- Document architecture and agent workflow.
- Add agent instructions for future Codex work.
- Keep the current XLSX-to-PNG script intact until the core refactor is ready.

## Phase 1: Core Generator

- Refactor the script into a reusable Python core package.
- Support pasted text, TXT, CSV, and XLSX inputs.
- Add style presets for text cards.
- Add stable filename modes.
- Add ZIP export.
- Generate `manifest.json` with item names, filenames, styles, and source metadata.
- Add focused tests for parsing, wrapping, image output, ZIP export, and empty input.

## Phase 2: Web Demo

- Create a Next.js app for the public demo.
- Add paste/list upload flow.
- Render generated cards in-browser.
- Add a tier-board preview with editable rows.
- Support drag-and-drop ranking.
- Export final tier-list PNG.
- Export asset ZIP.
- Deploy the demo early.

## Phase 3: Agentic Intake

- Add a structured extraction endpoint.
- Convert messy text into typed item candidates.
- Detect probable domains such as movies, games, anime, music, products, or generic text.
- Track confidence per item.
- Add a human review state for ambiguous items.
- Add eval fixtures for messy lists and ambiguous names.

## Phase 4: First Enricher

- Add one high-quality source connector first.
- Candidate choices:
  - TMDb for movies and TV.
  - RAWG or Steam for games.
  - AniList for anime.
- Fetch metadata and images.
- Preserve source URLs and credits.
- Fall back to generated text cards when enrichment fails.

## Phase 5: TierMaker Compatibility

- Export TierMaker-ready image batches.
- Respect batch constraints such as image count and total size.
- Generate a clear upload guide.
- Add a compatibility check in the web UI.
- Keep integration based on public user-visible workflows.

## Phase 6: Chrome Extension Companion

- Build a Manifest V3 extension.
- Detect supported TierMaker pages.
- Load or receive a Tierzo pack manifest.
- Show contextual upload guidance.
- Assist with titles, descriptions, batches, and validation where browser security allows.
- Avoid private TierMaker API dependencies.

## Phase 7: Public Launch Polish

- Add examples and screenshots.
- Add a concise English README.
- Add license, contributing guide, changelog, and issue templates.
- Add GitHub Actions for tests and linting.
- Publish tagged releases.
- Prepare launch demos for creators and developer audiences.
