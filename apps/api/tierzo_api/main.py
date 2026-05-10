from __future__ import annotations

import shutil
import time
import uuid
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from tierzo.agentic import IntakePlan, plan_intake
from tierzo.export import generate_pack, zip_pack
from tierzo.enrichers import EnrichedAsset, TmdbMovieEnricher
from tierzo.parsers import parse_text_lines
from tierzo.presets import PRESETS, TextCardPreset, get_preset


ROOT_DIR = Path(__file__).resolve().parents[3]
STORAGE_DIR = ROOT_DIR / ".tierzo" / "storage"
AGENT_CACHE_DIR = ROOT_DIR / ".tierzo" / "cache" / "agentic-intake"
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "10000"))
MAX_LIST_ITEMS = int(os.getenv("MAX_LIST_ITEMS", "200"))
PACK_TTL_SECONDS = int(os.getenv("PACK_TTL_SECONDS", "3600"))
DEFAULT_FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
ALLOW_MANUAL_IMAGE_URLS = os.getenv("ALLOW_MANUAL_IMAGE_URLS", "false").lower() in {
    "1",
    "true",
    "yes",
}

def load_root_env() -> None:
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        normalized_key = key.strip()
        if not os.environ.get(normalized_key):
            os.environ[normalized_key] = value.strip().strip('"').strip("'")


load_root_env()

FONT_PATHS = {
    "default": None,
    "impact": Path("C:/Windows/Fonts/impact.ttf"),
    "consolas": Path("C:/Windows/Fonts/consolab.ttf"),
    "trebuchet": Path("C:/Windows/Fonts/trebucbd.ttf"),
    "bahnschrift": Path("C:/Windows/Fonts/bahnschrift.ttf"),
    "georgia": Path("C:/Windows/Fonts/georgiab.ttf"),
    "comic": Path("C:/Windows/Fonts/comicbd.ttf"),
    "verdana": Path("C:/Windows/Fonts/verdanab.ttf"),
}
FONT_VARIANTS = {
    "default": {
        "regular": Path("C:/Windows/Fonts/arial.ttf"),
        "bold": Path("C:/Windows/Fonts/arialbd.ttf"),
        "italic": Path("C:/Windows/Fonts/ariali.ttf"),
        "bold_italic": Path("C:/Windows/Fonts/arialbi.ttf"),
    },
    "consolas": {
        "regular": Path("C:/Windows/Fonts/consola.ttf"),
        "bold": Path("C:/Windows/Fonts/consolab.ttf"),
        "italic": Path("C:/Windows/Fonts/consolai.ttf"),
        "bold_italic": Path("C:/Windows/Fonts/consolaz.ttf"),
    },
    "trebuchet": {
        "regular": Path("C:/Windows/Fonts/trebuc.ttf"),
        "bold": Path("C:/Windows/Fonts/trebucbd.ttf"),
        "italic": Path("C:/Windows/Fonts/trebucit.ttf"),
        "bold_italic": Path("C:/Windows/Fonts/trebucbi.ttf"),
    },
    "georgia": {
        "regular": Path("C:/Windows/Fonts/georgia.ttf"),
        "bold": Path("C:/Windows/Fonts/georgiab.ttf"),
        "italic": Path("C:/Windows/Fonts/georgiai.ttf"),
        "bold_italic": Path("C:/Windows/Fonts/georgiaz.ttf"),
    },
    "comic": {
        "regular": Path("C:/Windows/Fonts/comic.ttf"),
        "bold": Path("C:/Windows/Fonts/comicbd.ttf"),
        "italic": Path("C:/Windows/Fonts/comici.ttf"),
        "bold_italic": Path("C:/Windows/Fonts/comicz.ttf"),
    },
    "verdana": {
        "regular": Path("C:/Windows/Fonts/verdana.ttf"),
        "bold": Path("C:/Windows/Fonts/verdanab.ttf"),
        "italic": Path("C:/Windows/Fonts/verdanai.ttf"),
        "bold_italic": Path("C:/Windows/Fonts/verdanaz.ttf"),
    },
}


class CardStyleRequest(BaseModel):
    background: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    text_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    font_family: str = "default"
    bold: bool = True
    italic: bool = False
    underline: bool = False
    strike: bool = False
    text_shadow: bool = False
    background_opacity: float = Field(default=1.0, ge=0.2, le=1.0)
    border_width: int = Field(default=4, ge=0, le=16)
    corner_radius: int = Field(default=8, ge=0, le=48)
    glow_blur: int = Field(default=0, ge=0, le=32)
    image_label_position: str = Field(default="none", pattern=r"^(none|top|bottom|overlay)$")


class GeneratePackRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    preset: str = "arcade"
    size: int = Field(default=512, ge=256, le=1536)
    filename_mode: str = "both"
    title: str = "Tierzo Demo Pack"
    description: str | None = None
    row_labels: list[str] = Field(
        default_factory=lambda: ["S", "A", "B", "C", "D"],
        min_items=1,
        max_items=12,
    )
    custom_preset: CardStyleRequest | None = None
    enrichment_mode: str = "text"
    agent_cache_refresh: bool = False
    asset_overrides: dict[str, str] = Field(default_factory=dict)


class PackItemResponse(BaseModel):
    id: str
    name: str
    filename: str
    image_url: str
    asset_kind: str
    source_type: str
    source_value: str | None = None
    source_url: str | None = None
    confidence: float | None = None


class GeneratePackResponse(BaseModel):
    pack_id: str
    title: str
    description: str | None
    row_labels: list[str]
    item_count: int
    items: list[PackItemResponse]
    manifest_url: str
    zip_url: str
    extension_url: str
    enrichment_status: str
    agent_plan: dict[str, object] | None = None


class CreateJobResponse(BaseModel):
    job_id: str
    status: str


class JobStepResponse(BaseModel):
    id: str
    label: str
    status: str
    detail: str | None = None


class JobResponse(BaseModel):
    job_id: str
    status: str
    steps: list[JobStepResponse]
    pack: GeneratePackResponse | None = None
    error: str | None = None


@dataclass
class JobRecord:
    job_id: str
    status: str = "queued"
    steps: list[JobStepResponse] = field(default_factory=list)
    pack: GeneratePackResponse | None = None
    error: str | None = None


class TierMakerImagePayload(BaseModel):
    id: str
    name: str
    filename: str
    url: str
    mime_type: str
    position: int


class TierMakerBatchPayload(BaseModel):
    id: str
    image_count: int
    estimated_bytes: int
    images: list[TierMakerImagePayload]


class TierMakerExtensionPayload(BaseModel):
    schema_version: str
    source: str
    pack_id: str
    template: dict[str, object]
    tiermaker: dict[str, object]
    assets: dict[str, object]
    batches: list[TierMakerBatchPayload]


def normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def allowed_cors_origins() -> list[str]:
    raw = os.getenv("FRONTEND_URL") or os.getenv("ALLOW_ORIGINS")
    origins: list[str] = []
    if raw:
        origins.extend(
            normalize_origin(origin)
            for origin in raw.split(",")
            if origin.strip()
        )
    origins.extend(DEFAULT_FRONTEND_ORIGINS)
    return list(dict.fromkeys(origins))


def cleanup_expired_storage() -> None:
    if not STORAGE_DIR.exists():
        return
    cutoff = time.time() - PACK_TTL_SECONDS
    for child in STORAGE_DIR.iterdir():
        try:
            if child.is_dir():
                modified = child.stat().st_mtime
                if modified < cutoff:
                    shutil.rmtree(child)
            elif child.is_file() and child.suffix == ".zip":
                modified = child.stat().st_mtime
                if modified < cutoff:
                    child.unlink()
        except Exception:
            continue


app = FastAPI(title="Tierzo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    cleanup_expired_storage()


JOBS: dict[str, JobRecord] = {}


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "tmdb_configured": bool(os.getenv("TMDB_API_KEY")),
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
    }


@app.get("/presets")
def presets() -> dict[str, list[str]]:
    return {"presets": sorted(PRESETS)}


def resolve_font_path(font_family: str, *, bold: bool, italic: bool) -> Path | None:
    if font_family == "impact":
        return FONT_PATHS["impact"]
    if font_family == "bahnschrift":
        return FONT_PATHS["bahnschrift"]

    variant = "bold_italic" if bold and italic else "bold" if bold else "italic" if italic else "regular"
    variants = FONT_VARIANTS.get(font_family)
    if variants:
        path = variants.get(variant)
        if path and path.exists():
            return path
    return FONT_PATHS.get(font_family)


def default_job_steps() -> list[JobStepResponse]:
    return [
        JobStepResponse(id="read", label="Read source list", status="pending"),
        JobStepResponse(id="plan", label="Choose generation mode", status="pending"),
        JobStepResponse(id="assets", label="Find matching assets", status="pending"),
        JobStepResponse(id="render", label="Render cards", status="pending"),
        JobStepResponse(id="export", label="Prepare exports", status="pending"),
    ]


def update_job_step(
    job: JobRecord,
    step_id: str,
    status: str,
    detail: str | None = None,
) -> None:
    job.steps = [
        step.model_copy(update={"status": status, "detail": detail})
        if step.id == step_id
        else step
        for step in job.steps
    ]


def summarize_asset_step(pack: GeneratePackResponse) -> tuple[str, str | None]:
    if pack.enrichment_status == "text":
        return "done", "Text-card mode selected."

    match = pack.enrichment_status.removeprefix("tmdb_movie:")
    if "/" in match:
        matched, total = match.split("/", 1)
        status = "done" if matched == total else "warning"
        return status, f"Matched {matched}/{total} movie posters."

    if "missing_api_key" in pack.enrichment_status:
        return "warning", "TMDb key missing; fell back to text cards."

    if "error_fallback_text" in pack.enrichment_status:
        return "warning", "Asset lookup failed; fell back to text cards."

    return "done", pack.enrichment_status


ProgressCallback = Callable[[str, str | None], None]


def build_pack(
    payload: GeneratePackRequest,
    progress_callback: ProgressCallback | None = None,
) -> GeneratePackResponse:
    agent_plan: IntakePlan | None = None
    enrichment_mode = payload.enrichment_mode
    cleanup_expired_storage()
    values = parse_text_lines(payload.text)
    if len(values) > MAX_LIST_ITEMS:
        raise HTTPException(
            status_code=413,
            detail=f"List too large; maximum is {MAX_LIST_ITEMS} items.",
        )
    if payload.enrichment_mode == "auto":
        agent_plan = plan_intake(
            payload.text,
            cache_dir=AGENT_CACHE_DIR,
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            force_refresh=payload.agent_cache_refresh,
        )
        values = agent_plan.items
        enrichment_mode = agent_plan.tool
        if progress_callback:
            source = "cache" if agent_plan.cache_hit else agent_plan.source
            progress_callback("plan_done", f"Picked {agent_plan.domain} via {source}.")

    if not values:
        raise HTTPException(status_code=400, detail="No non-empty items found.")

    try:
        preset = get_preset(payload.preset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.custom_preset:
        preset = TextCardPreset(
            name=f"custom:{payload.preset}",
            background=payload.custom_preset.background,
            text_color=payload.custom_preset.text_color,
            accent_color=payload.custom_preset.accent_color,
            font_path=resolve_font_path(
                payload.custom_preset.font_family,
                bold=payload.custom_preset.bold,
                italic=payload.custom_preset.italic,
            ),
            font_label=payload.custom_preset.font_family,
            background_opacity=payload.custom_preset.background_opacity,
            border_width=payload.custom_preset.border_width,
            corner_radius=payload.custom_preset.corner_radius,
            glow_blur=payload.custom_preset.glow_blur,
            italic=payload.custom_preset.italic,
            underline=payload.custom_preset.underline,
            strike=payload.custom_preset.strike,
            text_shadow=payload.custom_preset.text_shadow,
            image_label_position=payload.custom_preset.image_label_position,
        )

    pack_id = uuid.uuid4().hex
    output_dir = STORAGE_DIR / pack_id
    zip_path = STORAGE_DIR / f"{pack_id}.zip"

    if output_dir.exists():
        shutil.rmtree(output_dir)

    enriched_assets = None
    enrichment_status = "text"
    force_text_values = {
        name
        for name, action in payload.asset_overrides.items()
        if action == "text"
    }
    manual_image_urls = (
        {
            name: action.removeprefix("image_url:")
            for name, action in payload.asset_overrides.items()
            if action.startswith("image_url:")
        }
        if ALLOW_MANUAL_IMAGE_URLS
        else {}
    )
    if enrichment_mode == "tmdb_movie":
        api_key = os.getenv("TMDB_API_KEY")
        if api_key:
            try:
                if progress_callback:
                    progress_callback("assets_running", f"Searching posters for {len(values)} items.")
                enriched_assets = TmdbMovieEnricher(api_key).enrich_many(values, output_dir / "_sources")
                for value in force_text_values:
                    if enriched_assets:
                        enriched_assets.pop(value, None)
                enriched_assets = apply_manual_image_overrides(
                    enriched_assets or {},
                    manual_image_urls,
                    output_dir / "_manual_sources",
                )
                enrichment_status = f"tmdb_movie:{len(enriched_assets)}/{len(values)}"
            except Exception:
                enriched_assets = None
                enrichment_status = "tmdb_movie:error_fallback_text"
        else:
            enrichment_status = "tmdb_movie:missing_api_key_fallback_text"
    if progress_callback:
        asset_status, asset_detail = summarize_asset_step(
            GeneratePackResponse(
                pack_id=pack_id,
                title=payload.title,
                description=payload.description,
                row_labels=payload.row_labels,
                item_count=len(values),
                items=[],
                manifest_url="",
                zip_url="",
                extension_url="",
                enrichment_status=enrichment_status,
                agent_plan=agent_plan.to_dict() if agent_plan else None,
            )
        )
        progress_callback(f"assets_{asset_status}", asset_detail)

    if enrichment_mode != "tmdb_movie" and manual_image_urls:
        enriched_assets = apply_manual_image_overrides(
            enriched_assets or {},
            manual_image_urls,
            output_dir / "_manual_sources",
        )
        enrichment_status = f"manual_image:{len(enriched_assets)}/{len(values)}"

    if progress_callback:
        progress_callback("render_running", f"Rendering {len(values)} cards.")
    manifest = generate_pack(
        values,
        output_dir,
        title=payload.title,
        size=payload.size,
        preset=preset,
        filename_mode=payload.filename_mode,
        write_manifest=True,
        enriched_assets=enriched_assets,
        extra_manifest={
            "description": payload.description,
            "row_labels": payload.row_labels,
            "enrichment": {
                "mode": payload.enrichment_mode,
                "resolved_mode": enrichment_mode,
                "status": enrichment_status,
                "agent_plan": agent_plan.to_dict() if agent_plan else None,
                "asset_overrides": payload.asset_overrides,
            },
            "card_style": {
                "preset": payload.preset,
                "background": preset.background,
                "text_color": preset.text_color,
                "accent_color": preset.accent_color,
                "font_family": preset.font_label,
                "bold": payload.custom_preset.bold if payload.custom_preset else True,
                "italic": payload.custom_preset.italic if payload.custom_preset else False,
                "underline": preset.underline,
                "strike": preset.strike,
                "text_shadow": preset.text_shadow,
                "background_opacity": preset.background_opacity,
                "border_width": preset.border_width,
                "corner_radius": preset.corner_radius,
                "glow_blur": preset.glow_blur,
                "image_label_position": preset.image_label_position,
            },
        },
    )
    if progress_callback:
        progress_callback("render_done", f"Rendered {len(manifest.items)} cards.")
        progress_callback("export_running", "Writing ZIP and extension payload.")
    zip_pack(output_dir, zip_path)
    if progress_callback:
        progress_callback("export_done", "Manifest, ZIP, and extension JSON are ready.")

    items = [
        PackItemResponse(
            id=item.id,
            name=item.name,
            filename=item.filename,
            image_url=f"/packs/{pack_id}/files/{item.filename}",
            asset_kind=item.asset_kind,
            source_type=item.source_type,
            source_value=item.source_value,
            source_url=item.source_url,
            confidence=item.confidence,
        )
        for item in manifest.items
    ]

    return GeneratePackResponse(
        pack_id=pack_id,
        title=manifest.title,
        description=payload.description,
        row_labels=payload.row_labels,
        item_count=len(items),
        items=items,
        manifest_url=f"/packs/{pack_id}/files/manifest.json",
        zip_url=f"/packs/{pack_id}/zip",
        extension_url=f"/packs/{pack_id}/tiermaker-extension.json",
        enrichment_status=enrichment_status,
        agent_plan=agent_plan.to_dict() if agent_plan else None,
    )


def apply_manual_image_overrides(
    enriched_assets: dict[str, EnrichedAsset],
    manual_image_urls: dict[str, str],
    image_dir: Path,
) -> dict[str, EnrichedAsset]:
    if not manual_image_urls:
        return enriched_assets

    image_dir.mkdir(parents=True, exist_ok=True)
    next_assets = dict(enriched_assets)
    for item_name, image_url in manual_image_urls.items():
        try:
            response = httpx.get(image_url, timeout=12.0, follow_redirects=True)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if content_type and not content_type.startswith("image/"):
                continue
            image_path = image_dir / f"manual-{uuid.uuid4().hex}.img"
            image_path.write_bytes(response.content)
            next_assets[item_name] = EnrichedAsset(
                query=item_name,
                title=item_name,
                source_type="manual-url",
                source_value=image_url,
                source_url=image_url,
                image_path=image_path,
                confidence=1.0,
            )
        except Exception:
            continue

    return next_assets


@app.post("/packs", response_model=GeneratePackResponse)
def create_pack(payload: GeneratePackRequest) -> GeneratePackResponse:
    return build_pack(payload)


def run_generation_job(job_id: str, payload: GeneratePackRequest) -> None:
    job = JOBS[job_id]
    job.status = "running"
    update_job_step(job, "read", "running")

    try:
        values = parse_text_lines(payload.text)
        if not values:
            raise HTTPException(status_code=400, detail="No non-empty items found.")

        update_job_step(job, "read", "done", f"Found {len(values)} source items.")
        update_job_step(job, "plan", "running")

        if payload.enrichment_mode != "auto":
            update_job_step(job, "plan", "done", f"Using {format_tool_for_step(payload.enrichment_mode)}.")

        def on_progress(event: str, detail: str | None) -> None:
            if event == "plan_done":
                update_job_step(job, "plan", "done", detail)
            elif event == "assets_running":
                update_job_step(job, "assets", "running", detail)
            elif event == "assets_done":
                update_job_step(job, "assets", "done", detail)
            elif event == "assets_warning":
                update_job_step(job, "assets", "warning", detail)
            elif event == "render_running":
                update_job_step(job, "render", "running", detail)
            elif event == "render_done":
                update_job_step(job, "render", "done", detail)
            elif event == "export_running":
                update_job_step(job, "export", "running", detail)
            elif event == "export_done":
                update_job_step(job, "export", "done", detail)

        pack = build_pack(payload, progress_callback=on_progress)

        if pack.agent_plan:
            if next(step for step in job.steps if step.id == "plan").status != "done":
                source = "cache" if pack.agent_plan.get("cache_hit") else pack.agent_plan.get("source", "agent")
                update_job_step(
                    job,
                    "plan",
                    "done",
                    f"Picked {pack.agent_plan.get('domain')} via {source}.",
                )
        else:
            if next(step for step in job.steps if step.id == "plan").status != "done":
                update_job_step(job, "plan", "done", f"Using {format_tool_for_step(payload.enrichment_mode)}.")

        job.pack = pack
        job.status = "completed"
    except HTTPException as exc:
        job.status = "failed"
        job.error = str(exc.detail)
        for step in job.steps:
            if step.status in {"pending", "running"}:
                update_job_step(job, step.id, "error")
                break
    except Exception as exc:
        job.status = "failed"
        job.error = "Tierzo could not generate this pack."
        for step in job.steps:
            if step.status in {"pending", "running"}:
                update_job_step(job, step.id, "error", str(exc))
                break


def format_tool_for_step(tool: str) -> str:
    if tool == "auto":
        return "Auto Agent"
    if tool == "tmdb_movie":
        return "Movie posters"
    return "Text cards"


@app.post("/jobs", response_model=CreateJobResponse)
def create_generation_job(
    payload: GeneratePackRequest,
    background_tasks: BackgroundTasks,
) -> CreateJobResponse:
    job_id = uuid.uuid4().hex
    JOBS[job_id] = JobRecord(job_id=job_id, steps=default_job_steps())
    background_tasks.add_task(run_generation_job, job_id, payload)
    return CreateJobResponse(job_id=job_id, status="queued")


@app.get("/jobs/{job_id}", response_model=JobResponse)
def get_generation_job(job_id: str) -> JobResponse:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobResponse(
        job_id=job.job_id,
        status=job.status,
        steps=job.steps,
        pack=job.pack,
        error=job.error,
    )


@app.get("/packs/{pack_id}/files/{filename}")
def get_pack_file(pack_id: str, filename: str) -> FileResponse:
    cleanup_expired_storage()
    path = STORAGE_DIR / pack_id / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path)


@app.get("/packs/{pack_id}/zip")
def get_pack_zip(pack_id: str) -> FileResponse:
    cleanup_expired_storage()
    path = STORAGE_DIR / f"{pack_id}.zip"
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="ZIP not found.")
    return FileResponse(path, filename=f"tierzo-{pack_id}.zip")


@app.get("/packs/{pack_id}/tiermaker-extension.json", response_model=TierMakerExtensionPayload)
def get_tiermaker_extension_payload(pack_id: str, request: Request) -> TierMakerExtensionPayload:
    cleanup_expired_storage()
    pack_dir = STORAGE_DIR / pack_id
    manifest_path = pack_dir / "manifest.json"
    zip_path = STORAGE_DIR / f"{pack_id}.zip"

    if not manifest_path.exists() or not pack_dir.is_dir():
        raise HTTPException(status_code=404, detail="Pack not found.")

    import json

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base_url = str(request.base_url).rstrip("/")

    images: list[TierMakerImagePayload] = []
    for index, item in enumerate(manifest["items"], start=1):
        filename = item["filename"]
        path = pack_dir / filename
        images.append(
            TierMakerImagePayload(
                id=item["id"],
                name=item["name"],
                filename=filename,
                url=f"{base_url}/packs/{pack_id}/files/{filename}",
                mime_type="image/png",
                position=index,
            )
        )

    max_images = 500
    batches = [
        TierMakerBatchPayload(
            id=f"batch-{batch_index + 1:03d}",
            image_count=len(batch),
            estimated_bytes=sum((pack_dir / image.filename).stat().st_size for image in batch),
            images=batch,
        )
        for batch_index, batch in enumerate(images[index : index + max_images] for index in range(0, len(images), max_images))
    ]

    template_title = manifest["title"]
    description = manifest.get("description") or f"Generated with Tierzo from {len(images)} list items."
    row_labels = manifest.get("row_labels") or ["S", "A", "B", "C", "D"]
    return TierMakerExtensionPayload(
        schema_version="tierzo.tiermaker-extension.v1",
        source="tierzo",
        pack_id=pack_id,
        template={
            "name": template_title,
            "description": description,
            "category": None,
            "credit_url": base_url,
            "cover_image_url": images[0].url if images else None,
        },
        tiermaker={
            "target_url": "https://tiermaker.com/categories/create/",
            "image_cropping_orientation": "Square",
            "row_labels": row_labels,
            "limits": {
                "max_images_per_upload": 500,
                "max_bytes_per_upload": 50 * 1024 * 1024,
                "minimum_images": 5,
            },
            "submission_policy": "extension may prefill and attach files; user must review and submit manually",
        },
        assets={
            "manifest_url": f"{base_url}/packs/{pack_id}/files/manifest.json",
            "zip_url": f"{base_url}/packs/{pack_id}/zip",
            "image_count": len(images),
        },
        batches=batches,
    )
