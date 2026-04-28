# Tierzo Product Brief

Tierzo is an agentic tier-list asset factory. It turns messy lists, spreadsheets, links, and prompts into polished image packs, editable tier-board previews, and exports that are ready for TierMaker or standalone sharing.

## Positioning

Tierzo is not a TierMaker clone. It is the prep layer before and around tier-list creation:

- Gather items from messy inputs.
- Normalize and enrich them.
- Generate consistent visual assets.
- Let users review what the agent/source tools found.
- Preview and rank items in a tier board.
- Export the final result or move the assets into TierMaker with minimal friction.

## Target Users

- Creators who make tier-list videos, streams, thumbnails, or social posts.
- Fandom communities ranking games, movies, anime, music, characters, teams, products, or memes.
- Power users who maintain lists in spreadsheets, Notion, Google Sheets, or plain text.
- Developers and open-source users who want an automatable tier-list asset pipeline.

## Core Promise

Paste anything. Tierzo figures out what it is, builds the image pack, shows its work, lets you correct it, and exports the result.

## Current Product State

Tierzo currently has:

- Python core and CLI for TXT, CSV, XLSX, manifests, ZIPs, and image generation.
- FastAPI backend with job-based generation.
- Next.js demo with inline editing, Card Lab, tier board, PNG export, ZIP export, manifest, and extension JSON.
- Auto Agent intake with OpenAI support and caching.
- TMDb movie poster enrichment.
- Review Matches with confidence/source metadata and text-card overrides.
- Legacy XLSX script preserved in `examples/`.

## Product Pillars

### Universal Intake

Tierzo should accept increasingly flexible inputs:

- Pasted text.
- CSV, TXT, and XLSX files.
- Public Google Sheets links.
- URLs from supported sources.
- Natural language prompts such as “top 50 horror movies” or “best PS2 survival horror games”.

### Agentic Curation

The agent should help transform raw input into reliable item candidates:

- Detect the likely domain.
- Clean noisy list formatting.
- Resolve ambiguous entities.
- Fetch metadata and source images when supported.
- Ask for human confirmation when confidence is low.
- Preserve provenance so users know where each asset came from.

The agent should be transparent first, autonomous second. Users should see decisions before they are locked into exports.

### Beautiful Assets

Generated assets should feel creator-ready, not like default script output:

- Consistent dimensions.
- Strong text fitting and wrapping.
- Style presets.
- Card Lab customization.
- Image-based tiles where APIs can provide posters, covers, logos, or artwork.
- Text-card fallbacks for unsupported or ambiguous items.

### Tier Board Preview

Tierzo should provide a usable tier-list board before export:

- Editable tier labels.
- Drag-and-drop item ranking.
- Preview of the final image.
- Download as a final tier-list PNG.
- Download as a source asset pack.

### TierMaker Compatibility

Tierzo should complement TierMaker without depending on private APIs:

- Export image formats and sizes that work well with TierMaker.
- Split exports into upload batches that respect TierMaker limits.
- Generate a manifest and upload guide.
- Provide an optional Chrome extension companion for guided TierMaker workflows.

## Differentiators

- Tierzo works before the tier-list editor, where most tedious work lives.
- Tierzo can use agents and source APIs to turn vague inputs into curated assets.
- Tierzo exposes matches, confidence, and sources instead of hiding agent decisions.
- Tierzo supports both standalone ranking and TierMaker-compatible exports.
- Tierzo keeps a local-first/open-source core while offering a polished hosted demo later.

## Non-Goals

- Do not clone TierMaker’s full community platform.
- Do not rely on reverse-engineered private TierMaker APIs.
- Do not require AI for basic local generation.
- Do not make the Chrome extension the only useful path.
- Do not silently choose low-confidence matches without review.

## First Wow Moment

The first public demo should show this flow:

1. Paste a messy list.
2. Tierzo normalizes it.
3. Tierzo generates polished item cards.
4. User ranks the cards in a live tier-board preview.
5. User downloads a final PNG and a TierMaker-ready ZIP.

Status: mostly implemented.

## Second Wow Moment

The second public demo should show enrichment:

1. Paste “top 50 horror movies”.
2. Tierzo detects movies.
3. Tierzo fetches posters and metadata.
4. User reviews matches and corrects a few.
5. Tierzo regenerates a polished pack with credits.

Status: started with Auto Agent, TMDb, Review Matches, and text-card overrides.

## Next Product Bet

The next differentiating work should focus on a provider/plugin contract:

- Make match review richer.
- Add “search again” and manual replacement per item.
- Add Steam or Spotify as the second real provider.
- Keep all providers returning the same reviewable match shape.
