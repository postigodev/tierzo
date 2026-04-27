from __future__ import annotations

import shutil
import uuid
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from tierzo.agentic import IntakePlan, plan_intake
from tierzo.export import generate_pack, zip_pack
from tierzo.enrichers import TmdbMovieEnricher
from tierzo.parsers import parse_text_lines
from tierzo.presets import PRESETS, TextCardPreset, get_preset


ROOT_DIR = Path(__file__).resolve().parents[3]
STORAGE_DIR = ROOT_DIR / ".tierzo" / "storage"
AGENT_CACHE_DIR = ROOT_DIR / ".tierzo" / "cache" / "agentic-intake"


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


class GeneratePackRequest(BaseModel):
    text: str = Field(min_length=1)
    preset: str = "arcade"
    size: int = Field(default=512, ge=256, le=1536)
    filename_mode: str = "both"
    title: str = "Tierzo Demo Pack"
    description: str | None = None
    row_labels: list[str] = Field(default_factory=lambda: ["S", "A", "B", "C", "D"])
    custom_preset: CardStyleRequest | None = None
    enrichment_mode: str = "text"
    agent_cache_refresh: bool = False


class PackItemResponse(BaseModel):
    id: str
    name: str
    filename: str
    image_url: str


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


app = FastAPI(title="Tierzo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/packs", response_model=GeneratePackResponse)
def create_pack(payload: GeneratePackRequest) -> GeneratePackResponse:
    agent_plan: IntakePlan | None = None
    enrichment_mode = payload.enrichment_mode
    values = parse_text_lines(payload.text)
    if payload.enrichment_mode == "auto":
        agent_plan = plan_intake(
            payload.text,
            cache_dir=AGENT_CACHE_DIR,
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            force_refresh=payload.agent_cache_refresh,
        )
        values = agent_plan.items
        enrichment_mode = agent_plan.tool

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
        )

    pack_id = uuid.uuid4().hex
    output_dir = STORAGE_DIR / pack_id
    zip_path = STORAGE_DIR / f"{pack_id}.zip"

    if output_dir.exists():
        shutil.rmtree(output_dir)

    enriched_assets = None
    enrichment_status = "text"
    if enrichment_mode == "tmdb_movie":
        api_key = os.getenv("TMDB_API_KEY")
        if api_key:
            try:
                enriched_assets = TmdbMovieEnricher(api_key).enrich_many(values, output_dir / "_sources")
                enrichment_status = f"tmdb_movie:{len(enriched_assets)}/{len(values)}"
            except Exception:
                enriched_assets = None
                enrichment_status = "tmdb_movie:error_fallback_text"
        else:
            enrichment_status = "tmdb_movie:missing_api_key_fallback_text"

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
            },
        },
    )
    zip_pack(output_dir, zip_path)

    items = [
        PackItemResponse(
            id=item.id,
            name=item.name,
            filename=item.filename,
            image_url=f"/packs/{pack_id}/files/{item.filename}",
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


@app.get("/packs/{pack_id}/files/{filename}")
def get_pack_file(pack_id: str, filename: str) -> FileResponse:
    path = STORAGE_DIR / pack_id / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path)


@app.get("/packs/{pack_id}/zip")
def get_pack_zip(pack_id: str) -> FileResponse:
    path = STORAGE_DIR / f"{pack_id}.zip"
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="ZIP not found.")
    return FileResponse(path, filename=f"tierzo-{pack_id}.zip")


@app.get("/packs/{pack_id}/tiermaker-extension.json", response_model=TierMakerExtensionPayload)
def get_tiermaker_extension_payload(pack_id: str, request: Request) -> TierMakerExtensionPayload:
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
