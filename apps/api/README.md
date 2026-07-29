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
- `GET /packs/{pack_id}/files/{filename}`
- `GET /packs/{pack_id}/zip`

`POST /packs` and `POST /jobs` accept exactly one input shape:

- Legacy: `{"text": "Alien\nThe Thing"}`.
- Canonical: `{"items": [{"id": "item-...", "name": "Alien"}]}`.

The canonical form preserves item identity across regeneration. Its
`item_asset_overrides` map is keyed by item ID. Legacy `asset_overrides`
remains name-keyed for compatibility. See [item identity](../../docs/IDENTITY.md).
