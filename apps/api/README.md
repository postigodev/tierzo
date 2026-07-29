# Tierzo API

FastAPI service for the Tierzo demo.

## Run

```powershell
uvicorn tierzo_api.main:app --app-dir apps/api --reload --port 8000
```

From the repo root:

```powershell
pnpm dev:api
```

## Endpoints

- `GET /health`
- `GET /presets`
- `POST /packs`
- `GET /packs/{pack_id}/status`
- `GET /packs/{pack_id}/files/{filename}`
- `GET /packs/{pack_id}/zip`
- `POST /jobs`
- `GET /jobs/{job_id}`

`POST /packs` and `POST /jobs` accept exactly one input shape:

- Legacy: `{"text": "Alien\nThe Thing"}`.
- Canonical: `{"items": [{"id": "item-...", "name": "Alien"}]}`.

The canonical form preserves item identity across regeneration. Its
`item_asset_overrides` map is keyed by item ID. Legacy `asset_overrides`
remains name-keyed for compatibility. See [item identity](../../docs/IDENTITY.md).

## Ephemeral lifecycle settings

Packs and generation jobs are local, in-process resources. They are not durable
across API restarts.

| Environment variable | Default | Meaning |
| --- | ---: | --- |
| `PACK_TTL_SECONDS` | `3600` | Lifetime of generated pack artifacts. |
| `PACK_TOMBSTONE_CAPACITY` | `1024` | Maximum retained expired-pack tombstones. |
| `PACK_TOMBSTONE_RETENTION_SECONDS` | `3600` | Retention time for expired-pack tombstones. |
| `JOB_ACTIVE_CAPACITY` | `8` | Maximum combined `pending` and `running` jobs. |
| `JOB_TERMINAL_CAPACITY` | `1024` | Maximum retained `completed` and `failed` jobs. |
| `JOB_TERMINAL_RETENTION_SECONDS` | `3600` | Retention time for terminal jobs. |

Job states are `pending`, `running`, `completed`, `failed`, and `lost`.
Pending and running jobs are never removed by retention cleanup. When active
capacity is full, `POST /jobs` returns HTTP `503` with
`detail.code = "job_capacity_reached"` and leaves existing active jobs
queryable.

`GET /jobs/{job_id}` always returns HTTP `200`; unknown or evicted jobs return
the typed `lost` state with null timestamps. Known jobs include UTC
`created_at` and `updated_at` timestamps. A completed job remains `completed`
even if its separate `pack_status` later becomes `expired` or `lost`.

Pack states are `completed`, `expired`, and `lost`. Expiration is reported only
while trusted timestamp evidence remains; after lifecycle evidence is evicted
or unavailable, the state is `lost`. These settings bound memory and local
artifact history but do not provide durable queues or permanent job history.
