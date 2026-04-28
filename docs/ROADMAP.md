# Tierzo Roadmap

This roadmap favors visible demos, useful exports, and stable primitives over broad platform scope. The demo is a first-class milestone, not launch polish.

## Phase 0: Product Foundation

Status: done.

- Define product direction and non-goals.
- Document architecture and agent workflow.
- Add agent instructions for future Codex work.
- Preserve the original XLSX prototype under `examples/`.
- Add MIT license.

## Phase 1: Core Generator

Status: done.

- Refactor the script into a reusable Python core package.
- Support pasted text, TXT, CSV, and XLSX inputs.
- Add style presets for text cards.
- Add stable filename modes.
- Add ZIP export.
- Generate `manifest.json` with item names, filenames, styles, and source metadata.
- Add tests for parsing, wrapping, image output, ZIP export, API flows, and agent caching.

## Phase 2: Web Demo

Status: mostly done.

- Create a Next.js app for the public demo.
- Add paste/list flow.
- Render generated cards in-browser.
- Add Card Lab.
- Add tier-board preview with editable rows.
- Support drag-and-drop ranking.
- Export final tier-list PNG.
- Export asset ZIP.
- Save/load board state locally.
- Use `docs/DEMO.md` as the acceptance checklist for this phase.

Remaining:

- Deploy the demo.
- Add screenshots/GIFs to README.
- Add file upload flow.

## Phase 3: Job-Based Generation

Status: done for local demo.

- Add `/jobs`.
- Add `/jobs/{id}` polling.
- Show live checklist progress in the UI.
- Keep synchronous `/packs` for compatibility.

Next:

- Persist jobs beyond process memory if hosted traffic needs it.
- Add queue/storage when generation gets slower or multi-user.

## Phase 4: Agentic Intake

Status: started.

- Add typed intake plans.
- Convert prompts/messy text into item candidates.
- Detect probable domains such as movies, games, anime, music, products, or generic text.
- Cache OpenAI plans.
- Fall back to deterministic heuristics.

Next:

- Add eval fixtures for messy lists and ambiguous names.
- Add more explicit ambiguity handling in the UI.
- Add trace/debug metadata safe for users.

## Phase 5: First Enricher And Review

Status: started.

- TMDb movie posters exist.
- Source URLs, confidence, and asset kind are exposed.
- Review Matches exists.
- Users can force specific matches back to text cards with `asset_overrides`.

Next:

- Add “search again” per item.
- Add “replace with URL/image” per item.
- Add manual match selection for multiple candidates.

## Phase 6: Provider Contract

Status: next major differentiator.

- Standardize match shape across providers.
- Add Steam for games or Spotify for music as the second provider.
- Keep every provider compatible with Review Matches.
- Preserve source credits and confidence.

Candidate providers:

- Steam for games.
- Spotify for music.
- AniList for anime.
- RAWG, PokéAPI, Wikidata, or link/image sources later.

## Phase 7: TierMaker Compatibility

Status: started.

- Export TierMaker-ready images and extension JSON.
- Respect basic batch constraints.

Next:

- Generate a clearer upload guide.
- Add compatibility status in the web UI.
- Build the Chrome extension companion.
- Keep integration based on public user-visible workflows.

## Phase 8: Public Launch Polish

Status: later.

- Add examples and screenshots.
- Add contributing guide, changelog, and issue templates.
- Add GitHub Actions for tests and linting.
- Publish tagged releases.
- Prepare launch demos for creators and developer audiences.
