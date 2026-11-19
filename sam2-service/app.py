"""SAM2 inference for rti-seg, its only caller (not exposed to the browser).

POST /segment, multipart:
  image      the picture
  points     [[x, y], ...] and labels [1|0, ...] (include / exclude)
  box        optional [x0, y0, x1, y1]
  multimask  "true" for SAM2's three granularities, otherwise one mask
  refine     rounds of SAM2's own mask_input refinement (default 0)

Answers every mask with its score and probability map, as a PNG at the model's
256x256 logit resolution, so the caller can pool probabilities across many
views and threshold once.
"""

import base64
import contextlib
import io
import json
import logging
import os
import threading

import numpy as np
import torch
from flask import Flask, jsonify, request
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS = {
    "tiny": ("configs/sam2.1/sam2.1_hiera_t.yaml", "sam2.1_hiera_tiny.pt"),
    "small": ("configs/sam2.1/sam2.1_hiera_s.yaml", "sam2.1_hiera_small.pt"),
    "base_plus": ("configs/sam2.1/sam2.1_hiera_b+.yaml", "sam2.1_hiera_base_plus.pt"),
    "large": ("configs/sam2.1/sam2.1_hiera_l.yaml", "sam2.1_hiera_large.pt"),
}
MODEL_SIZE = os.environ.get("MODEL_SIZE", "tiny")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_config, _checkpoint = MODELS[MODEL_SIZE]
_checkpoint = os.path.join(os.environ.get("APP_ROOT", "/opt/sam2"), "checkpoints", _checkpoint)
logger.info("Loading SAM2 %s from %s on %s", MODEL_SIZE, _checkpoint, DEVICE)
predictor = SAM2ImagePredictor(build_sam2(_config, _checkpoint, device=DEVICE))
# set_image and predict share the predictor's state: one request at a time
_lock = threading.Lock()

app = Flask(__name__)


def autocast():
    """bfloat16 on the GPU: 2.5x the throughput of fp32 at 0.995 mask IoU
    against it. CPU stays in fp32, where bf16 is no faster."""
    if DEVICE == "cuda":
        return torch.autocast("cuda", dtype=torch.bfloat16)
    return contextlib.nullcontext()


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/segment")
def segment():
    form = request.form
    try:
        image = np.array(Image.open(request.files["image"].stream).convert("RGB"))
        points = np.array(json.loads(form["points"]), dtype=np.float32).reshape(-1, 2)
        labels = np.array(json.loads(form["labels"]), dtype=np.int32)
        box = json.loads(form.get("box", "null"))
        refine = int(form.get("refine", 0))
    except Exception as exc:  # noqa: BLE001 - any malformed field is a bad request
        return jsonify({"error": f"bad request: {exc}"}), 400
    if len(points) == 0 or len(points) != len(labels):
        return jsonify({"error": "points and labels must be non-empty and the same length"}), 400

    kwargs = {"point_coords": points, "point_labels": labels, "multimask_output": form.get("multimask") == "true"}
    if box is not None:
        kwargs["box"] = np.array(box, dtype=np.float32).reshape(4)

    with _lock, torch.inference_mode(), autocast():
        predictor.set_image(image)
        _, scores, logits = predictor.predict(**kwargs)
        # hand the model its own best low-res logits back as a prior, and let
        # it sharpen against the same prompts
        for _ in range(refine):
            best = int(np.argmax(scores))
            _, scores, logits = predictor.predict(**dict(kwargs, multimask_output=False,
                                                         mask_input=logits[best:best + 1]))

    candidates = []
    for score, logit in zip(scores, logits):
        buf = io.BytesIO()
        probability = 1.0 / (1.0 + np.exp(-logit))
        Image.fromarray((probability * 255 + 0.5).astype(np.uint8)).save(buf, format="PNG")
        candidates.append({"score": float(score), "probability_png": base64.b64encode(buf.getvalue()).decode()})
    return jsonify({"candidates": candidates})
