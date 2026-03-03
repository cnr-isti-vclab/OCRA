# OCRA RTI Asset Ontology and Upload Pipeline  
*(OCRA Backend)*

## 1. Introduction

This document describes the **ontology**, **lifecycle**, and **handling pipeline** of an **RTI (Reflectance Transformation Imaging) digital asset** within the OCRA platform.

An RTI asset is represented as a **ZIP package** containing:

- `info.json` (required descriptor for OpenLIME)
- one or more **planes**, each stored in a specific *layout* (HTML-native image formats, DeepZoom, Google-style pyramids, or other multiresolution formats)
- when required by the layout, one or more **tile directories** (e.g. `*_files/…` for DeepZoom)

This report explains how the backend:

1. receives an RTI ZIP upload  
2. validates and extracts the archive  
3. stores it inside a project-specific directory  
4. exposes the extracted files via a public static URL  
5. returns the `info.json` URL needed by OpenLIME to instantiate an RTI layer  

It references the following backend files:

- `backend/src/middleware/rti-upload.middleware.ts`
- `backend/src/controllers/rti-asset.controller.ts`
- `backend/src/routes/hdt-metadata.routes.ts`
- `backend/src/app.ts`

---

# 2. RTI Asset Ontology

An **RTI Asset** in OCRA has the following conceptual structure:

| Component | Description |
|----------|-------------|
| **RTI Package (ZIP)** | User-supplied archive containing all RTI data needed by OpenLIME. |
| **info.json** | Mandatory descriptor containing RTI type (`hsh`, `ptm`, `rsc`, etc.), image dimensions, number of planes, colorspace, lighting directions/coefficients and other model-specific parameters. |
| **Planes** | One or more coefficient images for the RTI model. Each plane is stored using a layout supported by OpenLIME (single image, DeepZoom, Google, other pyramids, etc.). |
| **Tile directories (optional)** | Only present when the chosen layout is multi-resolution (e.g. DeepZoom). They hold tiled images referenced by layout-specific descriptors (`*.dzi`, Google metadata, etc.). |
| **Asset Slug** | Filesystem-safe identifier derived from the uploaded ZIP filename. Used to build the final storage path. |
| **Public URL Root** | `/assets/rti/:projectId/<assetSlug>/` — base HTTP path under which all extracted RTI files are exposed. |
| **infoJsonUrl** | URL to `info.json`, used by OpenLIME as the entry point for the RTI layer. |

## 2.1. Planes and Layouts

The concept of **plane** is purely model-related: each plane stores one coefficient image of the RTI representation. The **layout** defines how that plane is encoded and accessed:

- `image`: single 2D raster (e.g. PNG, JPEG)
- `deepzoom`: tiled multiresolution pyramid (`*.dzi` + `*_files/…`)
- `google`: Google-style tiled pyramid
- other layouts supported by OpenLIME

The backend does **not** interpret the internal layout details; it only:

- keeps the directory structure intact, and  
- exposes it via HTTP so that OpenLIME can fetch whatever the `info.json` and layout descriptors require.

The architecture is therefore **generic** with respect to the plane layout: the same ontology and upload pipeline apply to HSH, PTM, RSC, or future RTI-like models, regardless of how their planes are stored.

## 2.2. RTI DigitalAsset in HDT Metadata

Within the HDT (Heritage Digital Twin) metadata document, an RTI asset is represented as a **DigitalAsset** of type `rti`. This asset references:

- the **public URL** of `info.json` (`fileUrl`), served under `/assets/rti/...`
- the **RTI format** (`rtiFormat`), typically mirroring `info.json.type` (e.g. `hsh`, `ptm`, `rsc`)
- standard DigitalAsset properties (identifier, label, optional description, etc.)

The route defined in `backend/src/routes/hdt-metadata.routes.ts` is responsible for:

1. receiving a DigitalAsset payload of type `rti`
2. attaching it to the project’s HDT metadata
3. making it discoverable for viewers and annotation tools

The upload endpoint **does not** directly mutate the HDT document. Instead, it returns all information needed to build the corresponding DigitalAsset, and a separate HDT API call persists that asset in the project graph.

---

# 3. The RTI Upload Pipeline

The upload and validation process is composed of four sequential stages:

---

## **Stage 1 — Upload to a Temporary Directory**  
*(File: `backend/src/middleware/rti-upload.middleware.ts`)*

The upload is handled by a dedicated **Multer** middleware:

- Accepts one file: `file`
- Accepts only ZIP archives
- Saves the uploaded ZIP to a temporary folder, e.g.:

```text
rti_uploads_tmp/
```

The middleware:

- sanitizes the filename
- ensures a unique, safe name
- enforces basic size/mime constraints

This guarantees that the controller receives a valid, physically stored ZIP archive before any processing.

---

## **Stage 2 — Validation and Extraction**  
*(File: `backend/src/controllers/rti-asset.controller.ts`)*

The RTI asset controller (`uploadRtiAssetHandler`) is responsible for validating the archive and preparing it for long-term use.

It performs the following steps:

1. **Project ID validation**  
   Ensures that `projectId` is present in the route parameters.

2. **File presence check**  
   Verifies that `req.file` exists (Multer has stored the ZIP).

3. **Asset slug computation**  
   Derives a **slug** from the original filename (e.g. `coin_hsh.zip` → `coin_hsh`), normalizing it for safe filesystem usage.

4. **Creation of final asset directory**  

   ```text
   rti_assets/:projectId/<assetSlug>/
   ```

   The base path is configurable via `RTI_ASSETS_PATH` and defaults to `process.cwd()/rti_assets`.

5. **ZIP extraction**  
   Uses `extract-zip` to unpack the uploaded archive into the final directory, preserving the original directory structure of the RTI package.

6. **Temporary file cleanup**  
   Attempts to remove the temporary ZIP from the upload directory (best-effort; failure is logged but not fatal).

7. **Mandatory `info.json` presence check**  
   Ensures that an `info.json` file exists at the root of the extracted asset directory. If missing, the controller returns a 400 error (`Invalid RTI asset: info.json not found in archive.`).

8. **Parsing and summarising `info.json`**  
   Reads and parses `info.json`. From this metadata it extracts, at minimum:

   - `type` / `rtiFormat` (e.g. `hsh`, `ptm`, `rsc`)
   - `width`, `height`
   - `nplanes` (or similar field)
   - `format` (per-plane encoding, e.g. `jpg`)
   - `colorspace` (e.g. `rgb`)

   These values are not meant to fully duplicate the internal metadata, but to give the frontend enough information to:

   - display basic info to the user, and
   - correctly configure the RTI DigitalAsset.

9. **Public URL construction**  
   Constructs the **public URL** of `info.json`, which will be served by Express:

   ```text
   /assets/rti/:projectId/<assetSlug>/info.json
   ```

10. **Response payload**  
    Returns a JSON response containing:

    - `projectId`
    - `assetSlug`
    - `infoJsonUrl`
    - a minimal `infoSummary` (rtiType, width, height, nplanes, format, colorspace)
    - internal storage paths (for debugging/inspection)

Example (simplified):

```json
{
  "success": true,
  "projectId": "1234",
  "assetSlug": "coin_hsh",
  "infoJsonUrl": "/assets/rti/1234/coin_hsh/info.json",
  "infoSummary": {
    "rtiType": "hsh",
    "width": 1024,
    "height": 1024,
    "nplanes": 27,
    "format": "jpg",
    "colorspace": "rgb"
  }
}
```

At this point, the RTI model is fully stored and its files are ready to be served, but the asset is **not yet** part of the HDT metadata document.

---

## **Stage 3 — Route Registration**  
*(File: `backend/src/routes/hdt-metadata.routes.ts`)*

A dedicated route for RTI upload is defined in the HDT metadata router:

```ts
router.post(
  "/:projectId/hdt/assets/rti/upload",
  requireAuth,
  rtiUploadMiddleware,
  uploadRtiAssetHandler
);
```

Through the route mounting chain in `routes/index.ts` and `app.ts`, this endpoint becomes:

```text
POST /api/projects/:projectId/hdt/assets/rti/upload
```

Responsibilities of this route:

- enforce authentication/authorization via `requireAuth`
- receive an RTI ZIP through `rtiUploadMiddleware`
- delegate validation and extraction to `uploadRtiAssetHandler`
- return `infoJsonUrl` and metadata needed to build a DigitalAsset of type `rti`

A separate HDT API endpoint (also defined in `hdt-metadata.routes.ts`) handles the **creation and persistence** of the DigitalAsset, using the `infoJsonUrl` and `rtiFormat` returned by the upload endpoint.

---

## **Stage 4 — Static File Exposure**  
*(File: `backend/src/app.ts`)*

Once extracted, RTI assets must be available to the frontend and OpenLIME via HTTP.

This is achieved by registering a static route in `app.ts`:

```ts
const rtiAssetsRoot =
  process.env.RTI_ASSETS_PATH || path.join(process.cwd(), "rti_assets");

app.use("/assets/rti", express.static(rtiAssetsRoot));
```

The effect is:

- Any file under `rti_assets/...` is reachable at a URL under `/assets/rti/...`.
- For a given project and asset slug:

  - Filesystem: `rti_assets/:projectId/<assetSlug>/info.json`  
  - HTTP: `/assets/rti/:projectId/<assetSlug>/info.json`

This applies generically to **all** files of the RTI package:

- layout descriptors (`*.dzi`, or others)
- tiles (`*_files/...`)
- additional auxiliary files referenced by `info.json`

Express does not interpret the format: it simply exposes the directory so that OpenLIME can request the exact resources it needs based on the model’s layout.

---

# 4. End-to-End Workflow Diagram

Below is a conceptual diagram of the entire process.

```text
                ┌───────────────────────────────┐
                │ 1. User uploads RTI ZIP      │
                │    via POST /hdt/assets/rti  │
                └─────────────┬────────────────┘
                              │
                              ▼
             ┌──────────────────────────────────────┐
             │ Multer saves ZIP to temporary folder │
             │ (rti_uploads_tmp/)                   │
             └──────────────────┬───────────────────┘
                                │
                                ▼
          ┌────────────────────────────────────────────┐
          │ Controller validates ZIP contents           │
          │ - Check projectId & file                    │
          │ - Extract archive into                      │
          │   rti_assets/<project>/<slug>/              │
          │ - Ensure info.json is present               │
          │ - Parse metadata (type, dims, nplanes, …)   │
          │ - Build infoJsonUrl                         │
          └───────────────────┬────────────────────────┘
                              │
                              ▼
          ┌────────────────────────────────────────────┐
          │ Files persist as:                          │
          │   rti_assets/<project>/<slug>/             │
          └───────────────────┬────────────────────────┘
                              │
                              ▼
         ┌──────────────────────────────────────────────┐
         │ Express serves directory statically via:     │
         │   /assets/rti/<project>/<slug>/              │
         └───────────────────┬──────────────────────────┘
                              │
                              ▼
         ┌──────────────────────────────────────────────┐
         │ Frontend/OpenLIME receives:                  │
         │   infoJsonUrl = "/assets/rti/<p>/<slug>/..." │
         │ Builds a DigitalAsset of type "rti"          │
         │   (fileUrl = infoJsonUrl, rtiFormat, …)      │
         │ and uses it to instantiate an OpenLIME layer │
         └──────────────────────────────────────────────┘
```

---

# 5. Summary

The OCRA backend supports hybrid RTI assets with **generic plane layouts**, not limited to DeepZoom:

- **Multer middleware** (`rti-upload.middleware.ts`) safely accepts RTI ZIP archives.
- **RTI asset controller** (`rti-asset.controller.ts`) extracts, validates, and parses `info.json`.
- **Static server configuration** (`app.ts`) exposes the extracted asset under `/assets/rti/...`.
- **HDT metadata router** (`hdt-metadata.routes.ts`) provides:
  - an upload endpoint to prepare RTI assets, and
  - HDT APIs to persist RTI DigitalAssets.

The ontology is intentionally flexible:

- planes can use any layout supported by OpenLIME,  
- RTI formats (HSH, PTM, RSC, etc.) are captured via `info.json` and `rtiFormat`,  
- the backend remains agnostic of the internal math, focusing on storage, validation, and HTTP delivery.

This design allows OCRA to evolve towards multiple relightable imaging formats while exposing a stable RTI asset abstraction to both the frontend and the annotation workflows.
