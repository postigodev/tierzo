# Ephemeral Pack Lifecycle Design

## Goal

Make Tierzo's in-process jobs and temporary local artifacts honest,
recoverable, and bounded without adding durable infrastructure.

## Lifecycle Contracts

Server-owned job states are:

- `pending`: the job is queued but has not begun work.
- `running`: generation is active.
- `completed`: generation succeeded. Its pack may later expire without
  rewriting the successful job outcome.
- `failed`: generation reached a terminal application failure.
- `lost`: a referenced job is no longer present in ephemeral job memory.

Server-owned pack states are `completed`, `expired`, and `lost`. `expired`
requires evidence that a known pack passed its UTC `expires_at`; `lost` means
the artifact set is unavailable without that evidence.

`cancelled` and `timed_out` are client polling outcomes, not server job or pack
outcomes. They must not mutate or describe the underlying job as failed. The
`job_id` remains available so a client may resume polling later.

All timestamps are RFC 3339 UTC strings ending in `Z`.

## Backend

Known pack responses include non-null `created_at`, `expires_at`, and `status`;
an unknown `lost` pack has nullable timestamps. Known job responses include
non-null UTC `created_at` and `updated_at`; an unknown or evicted `lost` job has
nullable timestamps. Jobs expose `pack_status` separately when generation
completed. The server keeps job records, pack expiration evidence, and expired
tombstones only in memory.

Terminal jobs have configurable time retention and maximum capacity. Pack
tombstones also have configurable time retention and capacity. Once a record
or tombstone is evicted, lookup returns `lost`, never `expired`. Pending and
running jobs are not time-evicted.

Active jobs have a configurable capacity, defaulting to eight. When capacity is
full, `POST /jobs` rejects admission with HTTP `503` and structured
`detail.code = "job_capacity_reached"`; it never evicts active work. Tests
assert the admission boundary and that the existing active jobs remain
queryable.

`GET /packs/{pack_id}/status` always returns HTTP `200` with:

- `completed` and non-null timestamps;
- `expired` and the timestamps that prove expiration;
- `lost`, with nullable timestamps when no trustworthy metadata remains.

Resolver precedence is:

1. A retained tombstone, or a valid manifest whose `expires_at <= now`, is
   `expired`.
2. An unexpired valid manifest plus its directory, ZIP, and every item filename
   declared by the manifest is `completed`.
3. Every other case is `lost`.

Missing or malformed lifecycle metadata is not expiration evidence. A surviving
valid expired manifest after restart is evidence and resolves to `expired`.
An unknown or missing resource after restart resolves to `lost`.

Status checks never write or touch file modification times. Artifact endpoints
use the same resolver and return structured errors:

- HTTP `410`, `detail.code = "pack_expired"` for expired packs.
- HTTP `404`, `detail.code = "pack_lost"` for lost packs.

Error details include `resource`, `status`, `pack_id`, and nullable lifecycle
timestamps. Cleanup deletes expired artifacts and retains only a bounded
in-memory tombstone. Pack lifecycle metadata lives in the manifest artifact,
not in a durable history service.

`GET /jobs/{job_id}` always returns HTTP `200`, including a typed `lost` job
response for unknown or evicted IDs. A completed job remains `completed` while
its separate `pack_status` may become `expired` or `lost`.

## Web Restoration

Saved workspaces retain source items, tiers, board, style, and other draft
configuration independently from the temporary pack snapshot. Lifecycle
validation state is transient and separate from persisted artifact data.

On restore:

1. If persisted `expires_at` is already past, the client invalidates the
   artifact snapshot as expired without a network call.
2. Otherwise it requests pack status.
3. `completed` retains the snapshot.
4. `expired` or `lost` removes only artifact URLs/data/actions from persisted
   state. Source items, tiers, board/ranked IDs, title, description, style,
   enrichment configuration, and the last `job_id` remain intact.
5. Network/offline failure performs no destructive persisted-workspace write.
   The complete pre-restore state remains equal, while only a transient
   `validation_unavailable` UI state is added.

## Web Polling

Generation polling lives in a focused helper with:

- `AbortSignal` cancellation;
- a deadline configured through `NEXT_PUBLIC_JOB_POLL_TIMEOUT_MS`, defaulting
  to 60 seconds when missing, non-finite, or non-positive;
- bounded exponential backoff from 500 ms to 2 seconds;
- structured outcomes for completed, failed, lost, cancelled, and timed out.

The deadline includes in-flight requests. Reaching it aborts the request,
emits `timed_out`, and schedules no further request. Tests inject the clock,
timer, and fetch implementation to assert the boundary without wall-clock
delays.

The generation hook owns an AbortController and monotonic request token.
Unmount and replacement-generation aborts are silently ignored. Explicit
cancel sets visible `cancelled` state before invalidating the obsolete request.
Timeout sets visible `timed_out`. Both clear polling/loading, retain `job_id`,
send no server mutation, and allow polling to resume with that same ID. Only
the latest token may update pack, job, error, or loading state. Board
reconciliation remains a functional update against the latest board.

## UI

The existing workspace composition stays intact. Lifecycle messages plus
Cancel polling and Resume polling actions use the current generation area.

- Failed generation is shown as failed.
- Lost jobs and expired packs have distinct recovery copy.
- Cancelled or timed-out polling says generation may still be running and
  retains the `job_id`.
- Invalidated restored packs hide image/download actions while all editable
  workspace state remains available for regeneration.

## Verification

- Backend tests cover UTC timestamps, completed/expired/lost pack status,
  artifact parity, no TTL renewal, job loss, job failure, terminal-job
  eviction, tombstone eviction, and independent completed-job/expired-pack
  state. Schema assertions cover nullable timestamps for unknown lost resources
  and non-null timestamps for known resources. Capacity tests verify typed
  admission rejection without active-job eviction.
- Web unit tests cover polling completion, bounded timeout, explicit
  cancellation, resumption, stale-response protection primitives, and restored
  pack decisions including full persisted-state equality after offline
  validation.
- The real browser smoke generates a pack, reloads the workspace, validates
  restoration, simulates loss, preserves ranked IDs and configuration,
  regenerates, and verifies exports.

## Non-Goals

No Redis, S3, durable queues, accounts, permanent job history, cross-process
coordination, artifact renewal, or server-side cancellation is introduced.
