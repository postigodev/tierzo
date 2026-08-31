# Tierzo API

FastAPI service for the Tierzo web workspace.

## Run

From the repository root:

```powershell
pnpm dev:api
```

Or invoke Uvicorn directly:

```powershell
uvicorn tierzo_api.main:app --app-dir apps/api --reload --port 8000
```

Configuration is loaded from the root `.env` file; available settings and
defaults are listed in `.env.example`.

Current endpoints and request boundaries are documented in the
[FastAPI API architecture](../../docs/ARCHITECTURE.md#fastapi-api). Identity and
lifecycle semantics are documented in the adjacent canonical architecture
sections.

Jobs are process-local, while generated pack artifacts are stored on the local
filesystem. Neither provides a durable cross-deployment or restart guarantee.
