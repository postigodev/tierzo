# Tierzo Product Brief

Tierzo is an agentic tier-list asset factory. It turns messy lists, spreadsheets, and links into polished image packs, editable tier-board previews, and exports that are ready for TierMaker or standalone sharing.

## Positioning

Tierzo is not a TierMaker clone. It is the prep layer before and around tier-list creation:

- Gather items from messy inputs.
- Normalize and enrich them.
- Generate consistent visual assets.
- Preview and rank them in a tier board.
- Export the final result or move the assets into TierMaker with minimal friction.

## Target Users

- Creators who make tier-list videos, streams, thumbnails, or social posts.
- Fandom communities ranking games, movies, anime, music, characters, teams, products, or memes.
- Power users who maintain lists in spreadsheets, Notion, Google Sheets, or plain text.
- Developers and open-source users who want an automatable tier-list asset pipeline.

## Core Promise

Paste anything. Tierzo figures out what it is, builds the image pack, lets you preview the tier list, and exports the result.

## Product Pillars

### Universal Intake

Tierzo should accept increasingly flexible inputs:

- Pasted text.
- CSV, TXT, and XLSX files.
- Public Google Sheets links.
- URLs from supported sources.
- Natural language prompts such as "top 50 horror movies" or "best PS2 survival horror games".

### Agentic Curation

The agent should help transform raw input into reliable item candidates:

- Detect the likely domain.
- Clean noisy list formatting.
- Resolve ambiguous entities.
- Fetch metadata and source images when supported.
- Ask for human confirmation when confidence is low.
- Preserve provenance so users know where each asset came from.

### Beautiful Assets

Generated assets should feel creator-ready, not like default script output:

- Consistent dimensions.
- Strong text fitting and wrapping.
- Style presets.
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

- Tierzo works before the tier-list editor, where most of the tedious work lives.
- Tierzo can use agents and source APIs to turn vague inputs into curated assets.
- Tierzo supports both standalone ranking and TierMaker-compatible exports.
- Tierzo keeps a local-first/open-source core while offering a polished hosted demo.

## Non-Goals

- Do not clone TierMaker's full community platform.
- Do not rely on reverse-engineered private TierMaker APIs.
- Do not require AI for basic local generation.
- Do not make the Chrome extension the only useful path.

## First Wow Moment

The first public demo should show this flow:

1. Paste a messy list.
2. Tierzo normalizes it.
3. Tierzo generates polished item cards.
4. User ranks the cards in a live tier-board preview.
5. User downloads a final PNG and a TierMaker-ready ZIP.

## Later Wow Moment

The second public demo should show enrichment:

1. Paste "top 50 horror movies".
2. Tierzo detects movies.
3. Tierzo fetches posters and metadata.
4. User resolves a few ambiguous matches.
5. Tierzo generates a polished, ranked pack with credits.
