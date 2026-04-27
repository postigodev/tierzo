# Tierzo API

FastAPI service for the Tierzo demo.

## Run

```powershell
uvicorn tierzo_api.main:app --app-dir apps/api --reload --port 8000
```

From the repo root:

```powershell
pnpm api:dev
```

## Endpoints

- `GET /health`
- `GET /presets`
- `POST /packs`
- `GET /packs/{pack_id}/files/{filename}`
- `GET /packs/{pack_id}/zip`
