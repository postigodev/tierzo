# Tierzo Demo Plan

The demo is a first-class product goal. Tierzo should become understandable, impressive, and shareable before the full platform exists.

## Demo Promise

The public demo should prove this in under one minute:

Paste a messy list, let Tierzo generate or source assets, review what it found, preview the ranking, and export something useful.

The demo should not feel like a landing page with a tool attached. The tool is the first screen.

## Current Demo Story

The current demo already supports:

1. Open Tierzo.
2. Edit the tier-list title, description, and rows inline.
3. Describe a list or paste exact items from equal entry points.
4. Optionally expand style and generation settings to choose `Auto Agent`,
   `Text cards only`, or `Movie posters` and customize Card Lab.
5. Generate through an observable job panel.
6. Continue in a board-first workspace; reopen the compact source editor or
   review matches when needed.
7. Drag cards onto the tier board.
8. Export final PNG, ZIP, manifest, and TierMaker extension JSON.

This is now more than a deterministic text-card demo. It is the first human-in-the-loop agentic demo.

The workspace also recovers honestly across reloads while artifacts remain
temporary. Tierzo checks a saved pack before enabling image and download
actions. A confirmed `expired` or `lost` pack hides only those artifact-backed
actions; the pasted source, editable tier labels, ranking assignments, title,
description, style, generate mode, and last job ID remain ready to regenerate.
If the check cannot reach the API, Tierzo leaves the saved workspace untouched
and reports that validation is unavailable.

## First-Viewport Requirements

- Brand: Tierzo.
- Primary action: paste/generate.
- Compact tier-board cue before generation; the full board takes priority after
  generation.
- Describe and Paste are equally visible.
- Advanced options and Card Lab are available but collapsed by default.
- No generic marketing hero before the tool.
- No card-heavy SaaS landing layout before the usable experience.

The user should understand “messy list in, tier pack out” without reading a long explanation.

## Demo Inputs

Use inputs that feel culturally rankable and visually fun.

Good examples:

- PS2 survival horror games.
- A24 movies.
- Mario Kart items.
- Pokemon starters.
- Anime openings.
- Fast food fries.
- Fighting game characters.
- “top 20 alien movies” for Auto Agent + TMDb.

Avoid demo lists that are too generic, too corporate, or legally awkward as the only sample.

## Demo Modes

### Text Cards

- Works without API keys.
- Uses the local core.
- Shows style presets and Card Lab clearly.
- Produces clean PNGs and ZIP export.

### Auto Agent

- Uses `OPENAI_API_KEY` when configured.
- Classifies the list.
- Chooses a tool such as text cards or TMDb movie posters.
- Caches plans to reduce repeated calls.
- Falls back to heuristics/deterministic text cards when unavailable.

### Movie Posters

- Uses `TMDB_API_KEY`.
- Fetches real movie posters and source metadata.
- Falls back to text cards when the key is missing, lookup fails, or an item has no match.
- Shows source/confidence in Review Matches.
- Lets users force selected items back to text cards with `asset_overrides`.

## Visual Bar

The demo output should look good enough to share as a screenshot.

Minimum bar:

- Cards have strong type, spacing, and consistent sizing.
- Long names wrap without looking broken.
- Tier rows are readable and compact.
- Drag-and-drop states are obvious.
- Exported PNG does not include accidental UI chrome.
- ZIP contains predictable filenames and `manifest.json`.
- Review Matches makes source decisions visible without bloating the core flow.

Avoid:

- Default white SaaS dashboard vibes.
- Tiny preview tiles that cannot be inspected.
- Overly decorative UI that distracts from the pack.
- Text explaining the UI instead of making the UI obvious.

## Required Demo Artifacts

Each demo milestone should produce at least two artifacts:

- A working local command or URL.
- A screenshot or exported PNG.

Strong milestones should also produce:

- A ZIP export.
- A short GIF or video capture.
- A sample input file.
- A sample `manifest.json`.

## Demo Acceptance Checklist

A demo slice is not done until:

- A new user can complete the core flow without reading docs.
- The generated output is usable outside Tierzo.
- The output looks intentional at desktop and mobile sizes.
- The README can show a screenshot or exported result.
- The flow has one clear “wow” moment.
- The feature has a local verification command or browser check.

For the lifecycle slice, `pnpm demo:verify` additionally proves:

- a real generation and ranking survive a browser reload;
- a typed lost-pack response removes artifact actions without erasing editable
  workspace state;
- regeneration reuses the preserved board and creates a fresh temporary pack;
- manifest lifecycle timestamps are unambiguous UTC `Z` values;
- repeated status reads do not renew the recorded expiration;
- the regenerated image, ZIP, manifest, and board PNG remain exportable.

The current lifecycle is deliberately ephemeral. Server job states are
`pending`, `running`, `completed`, `failed`, and `lost`; pack states are
`completed`, `expired`, and `lost`. Browser-only polling cancellation or
timeout does not mean generation failed and can be resumed with the saved job
ID. This demo does not claim durable queues, durable artifact storage,
cross-restart job recovery, accounts, or permanent history.

## Demo Roadmap

### Demo 0: CLI Proof

Status: done.

- Generate images from TXT/CSV/XLSX.
- Export ZIP.
- Write manifest.
- Keep legacy script under `examples/`.

### Demo 1: Web Text-Card Studio

Status: done.

- Next.js app.
- Paste box.
- Preset picker.
- Card Lab.
- Download ZIP.

### Demo 2: Tier Board Preview

Status: done.

- Editable tier labels.
- Drag-and-drop cards.
- Export final tier-list PNG.
- Save/load board state locally.

### Demo 3: TierMaker-Ready Export

Status: started.

- Extension payload JSON exists.
- ZIP export exists.
- Next: extension UI and upload guide.

### Demo 4: Agentic Cleanup

Status: started.

- Auto Agent exists.
- OpenAI-backed planning exists.
- Caching exists.
- Next: richer review/correction and eval fixtures.

### Demo 5: First Real Enricher

Status: started.

- TMDb movie poster enrichment exists.
- Review Matches exists.
- Text-card overrides exist.
- Next: search-again/replace-match and a second provider such as Steam or Spotify.

## Collaboration Rule

When choosing between two technically valid next steps, prefer the one that makes the next demo more impressive, easier to explain, or easier to share.
