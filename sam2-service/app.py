import io
import json
import logging
import os

import cv2
import numpy as np
import torch
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

APP_ROOT = os.environ.get("APP_ROOT", "/opt/sam2")
MODEL_SIZE = os.environ.get("MODEL_SIZE", "tiny")

_SIZES = {
    "tiny": ("configs/sam2.1/sam2.1_hiera_t.yaml", "sam2.1_hiera_tiny.pt"),
    "small": ("configs/sam2.1/sam2.1_hiera_s.yaml", "sam2.1_hiera_small.pt"),
    "base_plus": ("configs/sam2.1/sam2.1_hiera_b+.yaml", "sam2.1_hiera_base_plus.pt"),
    "large": ("configs/sam2.1/sam2.1_hiera_l.yaml", "sam2.1_hiera_large.pt"),
}


def _load_predictor() -> SAM2ImagePredictor:
    cfg, ckpt_name = _SIZES.get(MODEL_SIZE, _SIZES["tiny"])
    checkpoint = os.path.join(APP_ROOT, "checkpoints", ckpt_name)

    if not os.path.exists(checkpoint):
        raise FileNotFoundError(
            f"SAM2 checkpoint not found at {checkpoint}. "
            f"Run ./sam2/checkpoints/download_ckpts.sh to download."
        )

    force_cpu = os.environ.get("SAM2_FORCE_CPU", "0") == "1"
    if torch.cuda.is_available() and not force_cpu:
        device = "cuda"
    elif torch.backends.mps.is_available() and not force_cpu:
        device = "mps"
    else:
        device = "cpu"

    logger.info(f"Loading SAM2 {MODEL_SIZE} from {checkpoint} on {device}")
    model = build_sam2(cfg, checkpoint, device=device)
    return SAM2ImagePredictor(model)


try:
    predictor: SAM2ImagePredictor | None = _load_predictor()
    logger.info("SAM2 predictor loaded successfully")
except FileNotFoundError as exc:
    logger.error(str(exc))
    predictor = None


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model_loaded": predictor is not None})


@app.post("/segment")
def segment():
    if predictor is None:
        return jsonify({"error": "SAM2 model not loaded – download checkpoints first"}), 503

    # Accept multipart (image file) or JSON (image_url for internal fetching)
    if request.content_type and "multipart" in request.content_type:
        if "image" not in request.files:
            return jsonify({"error": "image file required"}), 400
        img_file = request.files["image"]
        points = json.loads(request.form.get("points", "[]"))
        labels = json.loads(request.form.get("labels", "[]"))
        try:
            img = Image.open(img_file.stream).convert("RGB")
        except Exception as exc:
            return jsonify({"error": f"Failed to decode image: {exc}"}), 400
    else:
        body = request.get_json(force=True) or {}
        points = body.get("points", [])
        labels = body.get("labels", [])
        image_url = body.get("image_url", "")
        if not image_url:
            return jsonify({"error": "multipart image or image_url required"}), 400
        import requests as rq
        try:
            resp = rq.get(image_url, timeout=30)
            resp.raise_for_status()
            img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        except Exception as exc:
            return jsonify({"error": f"Failed to fetch image: {exc}"}), 400

    if not points or not labels:
        return jsonify({"error": "points and labels are required"}), 400

    img_array = np.array(img)
    H, W = img_array.shape[:2]

    pts = np.array(points, dtype=np.float32)
    lbs = np.array(labels, dtype=np.int32)

    with torch.inference_mode():
        predictor.set_image(img_array)
        masks, scores, _ = predictor.predict(
            point_coords=pts,
            point_labels=lbs,
            multimask_output=True,
        )

    best_idx = int(np.argmax(scores))
    mask = masks[best_idx].astype(np.uint8)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return jsonify({"polygon": [], "width": W, "height": H, "score": float(scores[best_idx])})

    largest = max(contours, key=cv2.contourArea)
    epsilon = 0.005 * cv2.arcLength(largest, True)
    simplified = cv2.approxPolyDP(largest, epsilon, True)
    polygon = simplified.reshape(-1, 2).tolist()

    return jsonify({
        "polygon": polygon,  # [[x, y], ...] in image pixel coordinates
        "width": W,
        "height": H,
        "score": float(scores[best_idx]),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
