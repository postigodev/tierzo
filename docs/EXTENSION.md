# Tierzo Browser Extension Contract

Tierzo should support a Chrome extension that helps users move generated packs into `https://tiermaker.com/categories/create/` without relying on private TierMaker APIs.

The extension should consume a stable Tierzo payload and assist the user-visible workflow on TierMaker's create-template page.

## Current Export

After generating a pack, the API exposes:

```text
GET /packs/{pack_id}/tiermaker-extension.json
```

The web demo links this as `Extension JSON`.

## Payload Purpose

The payload contains everything the extension needs to guide the TierMaker create flow:

- Template name.
- Template description.
- Optional category placeholder.
- Image credit URL.
- Cover image URL.
- Image cropping orientation.
- Default row labels.
- TierMaker upload limits.
- Absolute image URLs.
- Filename and ordering metadata.
- Batch splits for TierMaker's upload constraints.
- ZIP and manifest URLs.

## Extension Flow

Recommended first version:

1. User generates a pack in Tierzo.
2. User opens the extension payload or sends it to the extension.
3. User navigates to `https://tiermaker.com/categories/create/`.
4. Extension detects the create-template page.
5. Extension shows a Tierzo companion panel.
6. Extension pre-fills safe fields where possible:
   - Name of Template.
   - Description of Template.
   - Image Cropping Orientation.
   - Default Row Label Text.
   - Credit URL.
7. Extension helps attach image batches when browser APIs allow it.
8. User reviews and manually submits the form.

## Safety Boundary

The extension must not:

- Ask for TierMaker credentials.
- Call private TierMaker APIs.
- Submit or publish without explicit user action.
- Hide image source or credit information.

The extension may assist with user-visible fields and uploads, but the user should stay in control of the final submit step.

## Payload Shape

The current schema version is:

```text
tierzo.tiermaker-extension.v1
```

Example fields:

```json
{
  "schema_version": "tierzo.tiermaker-extension.v1",
  "source": "tierzo",
  "pack_id": "abc123",
  "template": {
    "name": "PS2 Survival Horror Demo",
    "description": "Generated with Tierzo from 8 list items.",
    "category": null,
    "credit_url": "http://localhost:8000",
    "cover_image_url": "http://localhost:8000/packs/abc123/files/001-silent-hill-2.png"
  },
  "tiermaker": {
    "target_url": "https://tiermaker.com/categories/create/",
    "image_cropping_orientation": "Square",
    "row_labels": ["S", "A", "B", "C", "D"],
    "limits": {
      "max_images_per_upload": 500,
      "max_bytes_per_upload": 52428800,
      "minimum_images": 5
    }
  },
  "assets": {
    "manifest_url": "http://localhost:8000/packs/abc123/files/manifest.json",
    "zip_url": "http://localhost:8000/packs/abc123/zip",
    "image_count": 8
  },
  "batches": [
    {
      "id": "batch-001",
      "image_count": 8,
      "estimated_bytes": 120000,
      "images": [
        {
          "id": "001",
          "name": "Silent Hill 2",
          "filename": "001-silent-hill-2.png",
          "url": "http://localhost:8000/packs/abc123/files/001-silent-hill-2.png",
          "mime_type": "image/png",
          "position": 1
        }
      ]
    }
  ]
}
```
