"""SAM2 click-to-segment for RTI assets, called by the 2D viewer.

POST /segment {asset, points: [[x, y], ...], labels: [1|0, ...]} -> {polygon}

`asset` is the RTI asset's URL as the viewer knows it (/assets/projects/...);
points and the polygon are in the asset's own pixels. The images SAM2 runs on
(derive.py) are rendered on first use and cached per asset.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import threading
from pathlib import Path

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

import derive
import segment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_FILES = Path(os.environ.get("PROJECT_FILES_PATH", "/app/project_files")).resolve()
CACHE_ROOT = Path(os.environ.get("DERIVED_PATH", "/app/derived"))
SAM2_URL = os.environ.get("SAM2_URL", "http://sam2:5001")
MAX_DIM = int(os.environ.get("RTI_SEG_MAX_DIM", "1024"))
ASSET_PREFIX = "/assets/projects/"

app = Flask(__name__)
CORS(app, origins=os.environ.get("CORS_ORIGINS", "http://localhost:3001").split(","))

# so two requests for a new asset do not both render it
_derive_lock = threading.Lock()


class BadRequest(Exception):
    pass


def resolve_asset(reference: str) -> Path:
    """Asset URL -> its directory under PROJECT_FILES; anything outside is refused."""
    ref = reference.split("?", 1)[0].split("#", 1)[0]
    if "://" in ref:
        ref = "/" + ref.split("://", 1)[1].split("/", 1)[-1]
    if ASSET_PREFIX in ref:
        ref = ref[ref.find(ASSET_PREFIX) + len(ASSET_PREFIX):]
    ref = ref.lstrip("/").removesuffix("info.json")

    target = (PROJECT_FILES / ref).resolve()
    if not ref or not target.is_relative_to(PROJECT_FILES) or not (target / "info.json").is_file():
        raise BadRequest("not an RTI asset")
    return target


def parse_prompt(body: dict) -> tuple[list, list]:
    """(positive points, negative points) from parallel points/labels lists."""
    try:
        points = [(float(x), float(y)) for x, y in body.get("points") or []]
        labels = [int(label) for label in body.get("labels") or []]
    except (TypeError, ValueError):
        raise BadRequest("points must be [[x, y], ...] and labels [1|0, ...]") from None
    if len(points) != len(labels):
        raise BadRequest("points and labels must be the same length")
    if 1 not in labels:
        raise BadRequest("at least one positive point is required")
    return ([p for p, label in zip(points, labels) if label == 1],
            [p for p, label in zip(points, labels) if label != 1])


def ensure_derived(asset: Path) -> Path:
    """The asset's derived images, rendered unless already cached. Keyed by the
    asset's info.json mtime, so a re-uploaded asset is rendered again."""
    key = f"{asset.relative_to(PROJECT_FILES)}:{(asset / 'info.json').stat().st_mtime_ns}:{MAX_DIM}"
    out = CACHE_ROOT / hashlib.sha1(key.encode()).hexdigest()[:16]
    if out.is_dir():
        return out
    with _derive_lock:
        if not out.is_dir():
            staging = out.with_name(out.name + ".partial")
            shutil.rmtree(staging, ignore_errors=True)
            derive.derive(asset, staging, MAX_DIM)
            staging.rename(out)  # only complete renders are ever visible
    return out


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/segment")
def post_segment():
    body = request.get_json(silent=True) or {}
    try:
        asset = resolve_asset(str(body.get("asset", "")))
        points, negatives = parse_prompt(body)
    except BadRequest as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        image_dir = ensure_derived(asset)
        info = json.loads((asset / "info.json").read_text())
        with Image.open(image_dir / f"{derive.VOTERS[0]}.png") as probe:
            w, h = probe.size
        # asset pixels <-> the pyramid level the images were rendered at
        sx, sy = w / info["width"], h / info["height"]
        polygon = segment.segment(image_dir, [(x * sx, y * sy) for x, y in points],
                                  [(x * sx, y * sy) for x, y in negatives], SAM2_URL)
    except segment.SegmentError as exc:
        return jsonify({"error": str(exc)}), 422
    except requests.RequestException:
        logger.exception("SAM2 request failed")
        return jsonify({"error": "SAM2 service unavailable"}), 502
    except Exception:  # noqa: BLE001 - log it, answer generically
        logger.exception("segment failed for %s", asset)
        return jsonify({"error": "segmentation failed"}), 500

    sx, sy = info["width"] / w, info["height"] / h
    return jsonify({"polygon": [[x * sx, y * sy] for x, y in polygon]})
