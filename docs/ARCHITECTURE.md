# Tierzo Architecture

This document is the single source of implemented technical contracts.
`README.md` owns public setup and current behavior; `docs/PRODUCT.md` owns
product direction. Future adapters are not part of this architecture until
they exist.

## System Boundaries

```text
apps/web/       Next.js workspace, review, ranking, and browser persistence
    | HTTP
apps/api/       FastAPI validation, planning, jobs, enrichment, and artifacts
    |
src/tierzo/     Deterministic parsing, rendering, manifests, ZIPs, and CLI
```

`examples/` contains the legacy XLSX prototype. New behavior belongs in the
tested core, API, or web boundary.

### Deterministic Core

The Python package owns source parsing, normalized source items, text/image
card rendering, presets, filenames, `tierzo.pack.v1` manifests, and ZIP export.
It has no web-framework or agent-runtime dependency. The CLI calls this layer
directly and assigns historical positional IDs when callers provide only
strings.

### FastAPI API

The API owns request validation and coordination:

- `POST /intakes/files` validates and parses TXT, CSV, and XLSX uploads.
- `POST /prompt-drafts` produces a typed draft from explicit or OpenAI-backed
  prompts.
- `POST /packs` performs synchronous generation for compatibility.
- `POST /jobs` and `GET /jobs/{id}` expose observable generation.
- `/packs/{id}/status`, `/files/{filename}`, `/zip`, and
  `/tiermaker-extension.json` expose lifecycle and artifacts.
- `GET /capabilities` reports deterministic, OpenAI, and TMDb availability.

Pack generation accepts exactly one input shape: legacy `text`, or canonical
structured `items` containing unique opaque IDs and names. Structured requests
use ID-keyed overrides. The legacy path retains name-keyed text overrides for
compatibility.

### Next.js Web App

The web app owns the editable workspace and user flow: paste/file/prompt
intake, source editing, capability-aware generation modes, progress, match
review, Card Lab styling, tier-board ranking, and downloads. It consumes typed
API responses and must not reproduce core rendering or backend lifecycle logic.

The browser stores `tierzo.editor.v3` in local storage. It may read and migrate
`tierzo.editor.v2` without deleting the old value. Editable workspace state and
temporary pack availability are separate: confirmed expiration or loss removes
artifact-backed actions, not the user's compatible source, tiers, rankings,
style, generation settings, or last job ID. Failed/offline validation is
non-destructive.

## Intake Contract

TXT uses normalized non-empty lines. CSV uses the first column; XLSX uses the
first column of the first worksheet. CSV/XLSX cell whitespace is collapsed,
source order and duplicates are retained, and headers are not inferred.

File intake validates the complete upload before replacing web source state.
It enforces configured byte, item, cell, XLSX member, and XLSX uncompressed-size
limits; uses server-controlled temporary paths where required; never derives a
storage path from the client filename; and removes temporary source files after
success or failure. Uploaded source files are not pack artifacts.

## Item Identity And Reconciliation

An item ID is the workspace-scoped identity of one list entry. It is opaque,
independent of display name, and never a filename or sort key. The web app
creates and persists IDs; the core copies them into manifests and TierMaker
payloads. Board assignments and canonical overrides are keyed by ID.

Reconciliation follows these rules:

- exact names preserve IDs across reorder;
- a clear one-for-one replacement is treated as a reviewable rename and keeps
  the ID;
- duplicate names remain separate items;
- new entries receive new IDs and start unranked;
- removed IDs are pruned deterministically;
- surviving IDs retain tier and relative order when generated assets change;
- ambiguous many-to-many edits receive new IDs with a warning rather than a
  silent guess.

This is not cross-device entity identity, semantic resolution, alias history,
workspace merging, or recognition of an item deleted and recreated later.
Legacy string callers cannot preserve identity through structural edits because
they do not supply IDs.

## Planning, Enrichment, And Assets

Deterministic planning handles explicit comma-, semicolon-, or newline-separated
lists. Open-ended prompt drafting requires OpenAI. Agent output is validated as
typed plan data before it can select an execution path.

TMDb movie posters are the only built-in external enricher. Enrichment returns
source type/value/URL, confidence, and a local decoded image when successful;
missing configuration, lookup failures, and partial matches produce structured
warnings and text-card fallbacks. Users can currently force an ID-keyed match
back to a text card.

Rendered items converge on the manifest's item contract (`id`, `name`,
`filename`, `asset_kind`, dimensions, and optional source/confidence fields).
There is no supported local/manual image-ingestion contract yet. A disabled-by-
default legacy URL override exists behind `ALLOW_MANUAL_IMAGE_URLS`; it is not
exposed by the web app and must not be treated as the future asset-ingestion
design.

Provider-specific fetching stays behind the API/core enrichment boundary.
External inputs are untrusted: new file or remote transports require decoding
validation, bounded bytes/dimensions/time, safe temporary paths and cleanup;
arbitrary server-side URL fetching additionally requires deliberate SSRF and
redirect controls.

## Jobs And Ephemeral Packs

Jobs and packs are local and non-durable. Job states are `pending`, `running`,
`completed`, `failed`, and `lost`. Active admission is bounded; a full API
returns typed `503 job_capacity_reached`. Completed jobs keep their terminal
outcome even if the associated pack later expires or is lost.

Pack states are `completed`, `expired`, and `lost`. `expired` requires retained
UTC expiration evidence; an unavailable resource without that evidence is
`lost`. Status reads do not renew lifetime. Artifact endpoints consistently
return typed `410 pack_expired` or `404 pack_lost` errors. Browser polling
timeout or cancellation is a client outcome and does not cancel or fail server
work.

Manifests record RFC 3339 UTC `created_at` and `expires_at`. Local artifact,
tombstone, active-job, and terminal-job retention is configured with
`PACK_*` and `JOB_*` environment variables. This provides bounded local state,
not cross-process recovery, durable queues, accounts, or permanent history.

## Portable Artifacts And TierMaker Compatibility

`tierzo.pack.v1` is the portable pack manifest. It records title/version,
ordered item IDs, filenames, asset/source metadata, and API-added generation,
style, row-label, and lifecycle metadata. ZIPs contain generated images and the
manifest.

The API also renders `tierzo.tiermaker-extension.v1` from an available pack. It
contains template metadata, public artifact URLs, row labels, ordered images,
and batches of at most 500 images. This is an export contract despite its
historical schema name: no browser extension exists. Consumers may assist with
public TierMaker forms, but the user must review and submit. Tierzo never asks
for TierMaker credentials or depends on private TierMaker APIs.

## Configuration And Deployment

The repository runs the web app and API as separate local processes. No
production deployment configuration is checked in. Deployments must configure
the web API base URL and explicit frontend CORS origins, provide optional
OpenAI/TMDb keys server-side, and account for the API's process-local storage.

Important boundaries are documented in `.env.example`: input limits,
`FRONTEND_URL`/`ALLOW_ORIGINS`, `NEXT_PUBLIC_API_URL`, `TIERZO_STORAGE_DIR`, pack
retention, and job capacity/retention. A multi-instance or restart-safe service
would require a deliberate durable storage and job design; the current system
must not imply those guarantees.
