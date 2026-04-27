from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from tierzo.export import generate_pack, zip_pack
from tierzo.parsers import parse_text_lines
from tierzo.presets import PRESETS, get_preset


ROOT_DIR = Path(__file__).resolve().parents[3]
STORAGE_DIR = ROOT_DIR / ".tierzo" / "storage"


class GeneratePackRequest(BaseModel):
    text: str = Field(min_length=1)
    preset: str = "arcade"
    size: int = Field(default=512, ge=256, le=1536)
    filename_mode: str = "both"
    title: str = "Tierzo Demo Pack"
    description: str | None = None
    row_labels: list[str] = Field(default_factory=lambda: ["S", "A", "B", "C", "D"])


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
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/presets")
def presets() -> dict[str, list[str]]:
    return {"presets": sorted(PRESETS)}


@app.post("/packs", response_model=GeneratePackResponse)
def create_pack(payload: GeneratePackRequest) -> GeneratePackResponse:
    values = parse_text_lines(payload.text)
    if not values:
        raise HTTPException(status_code=400, detail="No non-empty items found.")

    try:
        preset = get_preset(payload.preset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    pack_id = uuid.uuid4().hex
    output_dir = STORAGE_DIR / pack_id
    zip_path = STORAGE_DIR / f"{pack_id}.zip"

    if output_dir.exists():
        shutil.rmtree(output_dir)

    manifest = generate_pack(
        values,
        output_dir,
        title=payload.title,
        size=payload.size,
        preset=preset,
        filename_mode=payload.filename_mode,
        write_manifest=True,
        extra_manifest={
            "description": payload.description,
            "row_labels": payload.row_labels,
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
