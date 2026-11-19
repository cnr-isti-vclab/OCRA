"""SAM2 segmentation across an asset's derived images (see derive.py).

1. locate     one SAM2 call per image, full frame, every granularity. Masks
              that overlap are grouped into hypotheses (a detail, the figure,
              the whole coin) and the tightest credible one is chosen.
2. re-prompt  the clicked points, plus points deep inside that hypothesis,
              negatives in a ring around it, and its padded box.
3. zoom       each image cropped to the hypothesis at two paddings and run
              under four flips; SAM2 resizes its input to 1024, so a crop puts
              more model pixels on the object. Predictions are un-flipped.
4. combine    average the probabilities, drop views that disagree with the
              average, average again, snap to the slope image's edges, then
              threshold once and trace the outline.
"""

from __future__ import annotations

import base64
import io
import json
import math
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from scipy import ndimage

import rti_render as R
from derive import VOTERS

FLIPS = ((False, False), (True, False), (False, True), (True, True))
PADS = (0.25, 0.6)  # crop padding, as a fraction of the hypothesis box
CLUSTER_IOU = 0.5  # masks overlapping this much describe the same thing
MIN_SUPPORT = 0.5  # see _choose
SUPPORT_GAMMA = 0.25
MIN_SCORE_FRACTION = 0.4
MIN_ABSOLUTE_SUPPORT = 3
SEED_POINTS = 3  # extra positives sampled inside the chosen hypothesis
RING_NEGATIVES = 8  # negatives sampled just outside it
BOX_PAD = 0.15  # so pass 2 can still find parts pass 1 missed
CONTEST_SCALE = 3.0  # see the contested mask in segment()
REFINE_ROUNDS = 2  # SAM2 mask_input refinement rounds in pass 2
REJECT_IOU = 0.5  # views agreeing less than this with the average are dropped
SMOOTH_PX = 1.5
SIMPLIFY = 0.0003  # outline tolerance, as a fraction of its perimeter
REQUEST_TIMEOUT = 120


class SegmentError(Exception):
    """The prompt found nothing usable; a user problem, not a server fault."""


# --------------------------------------------------------------------------
# SAM2
# --------------------------------------------------------------------------


def _predict(session: requests.Session, sam2_url: str, png: bytes, size: tuple,
             points: list, labels: list, box: tuple | None = None, refine: int = 0) -> list[dict]:
    """Every mask SAM2 returns for one image, as probability maps at `size`."""
    data = {
        "points": json.dumps([[float(x), float(y)] for x, y in points]),
        "labels": json.dumps(labels),
        # a box already answers "which thing?", so one mask is enough
        "multimask": "false" if box is not None else "true",
        "refine": str(refine),
    }
    if box is not None:
        data["box"] = json.dumps([float(v) for v in box])
    r = session.post(f"{sam2_url}/segment", files={"image": ("image.png", png, "image/png")},
                     data=data, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return [{"score": float(c["score"]), "prob": _decode(c["probability_png"], size)}
            for c in r.json()["candidates"]]


def _decode(b64: str, size: tuple) -> np.ndarray:
    """SAM2's 256x256 probability, bilinearly upsampled to `size` as SAM2
    itself would have."""
    with Image.open(io.BytesIO(base64.b64decode(b64))) as im:
        if im.size != size:
            im = im.convert("L").resize(size, Image.BILINEAR)
        return np.asarray(im.convert("L"), dtype=np.float32) / 255.0


def _png(im: Image.Image) -> bytes:
    # compression level 1: same pixels, a fraction of the encode time
    buf = io.BytesIO()
    im.save(buf, format="PNG", compress_level=1)
    return buf.getvalue()


# --------------------------------------------------------------------------
# Choosing what was clicked
# --------------------------------------------------------------------------


def iou(a: np.ndarray, b: np.ndarray) -> float:
    union = np.count_nonzero(a | b)
    return float(np.count_nonzero(a & b) / union) if union else 0.0


def _cluster(proposals: list) -> list[list]:
    """Group masks describing the same thing, largest first. Membership is
    tested against a group's first (largest) mask, so it cannot creep down in
    scale as it grows."""
    clusters: list[list] = []
    for p in sorted(proposals, key=lambda p: -p["area"]):
        best, best_iou = None, 0.0
        for c in clusters:
            v = iou(p["mask"], c[0]["mask"])
            if v > best_iou:
                best, best_iou = c, v
        if best is not None and best_iou >= CLUSTER_IOU:
            best.append(p)
        else:
            clusters.append([p])
    return clusters


def _summarise(cluster: list, shape: tuple) -> dict:
    """Majority vote inside one hypothesis, one vote (its best mask) per image."""
    by_image: dict = {}
    for m in cluster:
        if m["image"] not in by_image or m["score"] > by_image[m["image"]]["score"]:
            by_image[m["image"]] = m
    members = sorted(by_image.values(), key=lambda m: m["image"])

    votes = np.zeros(shape, dtype=np.int16)
    for m in members:
        votes += m["mask"]
    support = len(members)
    # threshold the blurred vote field, which takes the staircase off the boundary
    field = ndimage.gaussian_filter(votes.astype(np.float32) / support, 1.0)
    consensus = largest_blob(field >= math.ceil(0.5 * support) / support - 1e-6)
    return {
        "support": support,
        "consensus": consensus,
        "area": int(np.count_nonzero(consensus)),
        "score": float(np.mean([m["score"] for m in members])),
    }


def _choose(hyps: list, n_images: int) -> int:
    """The tightest credible hypothesis; `hyps` sorted smallest first.

    A flat support floor rejects exactly the answer wanted: relighting moves a
    big mask's boundary a few pixels and it still clusters with itself, while a
    small one drifts apart, so on a coin the whole coin gets every image's
    support and the stamped figure a third of it. The floor is therefore scaled
    by size, (area / largest) ** SUPPORT_GAMMA. To keep that from admitting
    speckle, a hypothesis also needs MIN_ABSOLUTE_SUPPORT images and a SAM2
    score of at least MIN_SCORE_FRACTION of the best one.
    """
    largest = max(h["area"] for h in hyps) or 1
    floor_score = max(0.05, MIN_SCORE_FRACTION * max(h["score"] for h in hyps))
    for k, h in enumerate(hyps):
        floor = max(MIN_ABSOLUTE_SUPPORT,
                    int(math.ceil(MIN_SUPPORT * n_images * (h["area"] / largest) ** SUPPORT_GAMMA)))
        if h["support"] >= floor and h["score"] >= floor_score:
            return k
    # nothing credible: fall back on agreement, then SAM2's own confidence
    return max(range(len(hyps)), key=lambda k: (hyps[k]["support"], hyps[k]["score"]))


# --------------------------------------------------------------------------
# A better prompt from the first pass
# --------------------------------------------------------------------------


def _seed_points(mask: np.ndarray, n: int) -> list:
    """Points as deep inside the mask as possible, spread apart."""
    dist = ndimage.distance_transform_edt(mask)
    work = dist.copy()
    picks = []
    for _ in range(n):
        y, x = divmod(int(np.argmax(work)), mask.shape[1])
        if work[y, x] < 2.0:
            break
        picks.append((float(x), float(y)))
        yy, xx = np.ogrid[:mask.shape[0], :mask.shape[1]]
        work[(yy - y) ** 2 + (xx - x) ** 2 <= (0.5 * dist[y, x] + 8) ** 2] = 0
    return picks


def _ring_points(mask: np.ndarray, n: int, contested: np.ndarray,
                 gap: float = 8.0, width: float = 24.0) -> list:
    """Background points in a band just outside the mask, spread by angle, and
    never on ground the first pass was split about: a thin arm some views
    include lands exactly there, and calling it background would make the
    majority's omission unrecoverable."""
    dist = ndimage.distance_transform_edt(~mask)
    ys, xs = np.nonzero((dist > gap) & (dist <= gap + width) & ~contested)
    if len(ys) == 0:
        return []
    cy, cx = ndimage.center_of_mass(mask)
    order = np.argsort(np.arctan2(ys - cy, xs - cx))
    take = order[np.linspace(0, len(order) - 1, min(n, len(order))).astype(int)]
    return [(float(xs[i]), float(ys[i])) for i in take]


def _crop_box(mask: np.ndarray, pad: float, shape: tuple) -> tuple:
    """Bounding box of the mask, padded, clipped, never degenerate."""
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    py, px = pad * (y1 - y0), pad * (x1 - x0)
    y0, y1 = max(0, int(y0 - py)), min(shape[0], int(y1 + py))
    x0, x1 = max(0, int(x0 - px)), min(shape[1], int(x1 + px))
    if y1 - y0 < 32 or x1 - x0 < 32:
        return 0, 0, shape[1], shape[0]
    return x0, y0, x1, y1


def _flip_image(im: Image.Image, fx: bool, fy: bool) -> Image.Image:
    if fx:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if fy:
        im = im.transpose(Image.FLIP_TOP_BOTTOM)
    return im


def _flip_points(pts: list, fx: bool, fy: bool, w: int, h: int) -> list:
    return [((w - 1 - x) if fx else x, (h - 1 - y) if fy else y) for x, y in pts]


def _unflip(arr: np.ndarray, fx: bool, fy: bool) -> np.ndarray:
    if fx:
        arr = arr[:, ::-1]
    if fy:
        arr = arr[::-1, :]
    return arr


def _average(views: list, keep: list, shape: tuple) -> np.ndarray:
    """Mean probability over the kept views, wherever each one has an opinion."""
    total = np.zeros(shape, dtype=np.float32)
    count = np.zeros(shape, dtype=np.float32)
    for i in keep:
        x0, y0, x1, y1 = views[i]["box"]
        total[y0:y1, x0:x1] += views[i]["prob"].astype(np.float32) / 255.0
        count[y0:y1, x0:x1] += 1.0
    return np.divide(total, count, out=np.zeros_like(total), where=count > 0)


# --------------------------------------------------------------------------
# Outline
# --------------------------------------------------------------------------


def largest_blob(mask: np.ndarray) -> np.ndarray:
    """The largest connected component, holes filled."""
    if not mask.any():
        return mask
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        mask = lab == (int(np.argmax(sizes)) + 1)
    return ndimage.binary_fill_holes(mask)


# 8-neighbourhood in clockwise order, starting west.
_NB = ((0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1))


def _trace_contour(mask: np.ndarray) -> list[tuple[int, int]]:
    """Moore-neighbour trace of a single filled blob, as (x, y) pixels."""
    h, w = mask.shape
    flat = int(np.argmax(mask))
    if not mask.flat[flat]:
        return []
    start = (flat // w, flat % w)  # topmost-leftmost pixel, so west is outside
    contour = [start]
    cur, back = start, 0
    limit = 4 * (h + w) + 16 * int(np.count_nonzero(mask) ** 0.5)
    while len(contour) < limit:
        for k in range(1, 9):
            i = (back + k) % 8
            ny, nx = cur[0] + _NB[i][0], cur[1] + _NB[i][1]
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                back = (i + 4) % 8  # resume the scan just past where we came from
                cur = (ny, nx)
                break
        else:
            break  # isolated pixel
        if cur == start:
            break
        contour.append(cur)
    return [(int(x), int(y)) for y, x in contour]


def _simplify(points: list, tol: float) -> list:
    """Douglas-Peucker, iterative so a long contour cannot blow the stack."""
    if len(points) < 3 or tol <= 0:
        return points
    pts = np.asarray(points, dtype=np.float64)
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        seg = pts[j] - pts[i]
        length = math.hypot(*seg)
        rel = pts[i + 1:j] - pts[i]
        if length < 1e-9:
            d = np.hypot(rel[:, 0], rel[:, 1])
        else:
            d = np.abs(rel[:, 0] * seg[1] - rel[:, 1] * seg[0]) / length
        k = int(np.argmax(d))
        if d[k] > tol:
            keep[i + 1 + k] = True
            stack.append((i, i + 1 + k))
            stack.append((i + 1 + k, j))
    return [tuple(p) for p in pts[keep].tolist()]


def _outline(mask: np.ndarray) -> list:
    """Traced, smoothed along its own length (the trace is a staircase of 1px
    steps), and simplified."""
    contour = _trace_contour(mask)
    if len(contour) >= 8:
        p = np.asarray(contour, dtype=np.float64)
        contour = list(zip(ndimage.gaussian_filter1d(p[:, 0], SMOOTH_PX, mode="wrap"),
                           ndimage.gaussian_filter1d(p[:, 1], SMOOTH_PX, mode="wrap")))
    if len(contour) < 3:
        return []
    perimeter = sum(math.dist(contour[i], contour[(i + 1) % len(contour)]) for i in range(len(contour)))
    return _simplify(contour, SIMPLIFY * perimeter)


# --------------------------------------------------------------------------


def segment(image_dir: Path, points: list, negatives: list, sam2_url: str) -> list:
    """Outline of what the points select, in the derived images' pixels."""
    paths = [image_dir / f"{name}.png" for name in VOTERS]
    with Image.open(paths[0]) as probe:
        W, H = probe.size
    for x, y in points + negatives:
        if not (0 <= x < W and 0 <= y < H):
            raise SegmentError("a point is outside the image")
    session = requests.Session()

    # ---- pass 1: locate, full frame, every granularity ----
    # No refinement here: it keeps only the best mask, and the point of this
    # pass is to see every granularity, so a click on a figure can get the
    # figure rather than the coin it is stamped on.
    proposals = []
    labels = [1] * len(points) + [0] * len(negatives)
    for i, path in enumerate(paths):
        for c in _predict(session, sam2_url, path.read_bytes(), (W, H), points + negatives, labels):
            mask = c["prob"] >= 0.5
            area = int(np.count_nonzero(mask))
            if area == 0 or not all(mask[int(y), int(x)] for x, y in points) or area > 0.92 * W * H:
                continue
            proposals.append({"image": i, "mask": mask, "score": c["score"], "area": area})

    hyps = [h for h in (_summarise(c, (H, W)) for c in _cluster(proposals)) if h["area"] > 0]
    if not hyps:
        raise SegmentError("no region found at that point; try another spot or add a point")
    hyps.sort(key=lambda h: h["area"])
    target = hyps[_choose(hyps, len(paths))]
    consensus = target["consensus"]

    # ---- pass 2: a better question, asked many times ----
    seeds = _seed_points(consensus, SEED_POINTS)
    # ground a comparable pass-1 reading claimed and this one did not
    contested = np.zeros((H, W), dtype=bool)
    for p in proposals:
        if 0.3 * target["area"] <= p["area"] <= CONTEST_SCALE * target["area"]:
            contested |= p["mask"]
    contested &= ~consensus
    fg = points + seeds
    bg = negatives + _ring_points(consensus, RING_NEGATIVES, contested)

    images = []
    for path in paths:
        with Image.open(path) as im:
            images.append(im.convert("RGB"))
    ys, xs = np.nonzero(consensus)
    gx, gy = BOX_PAD * (xs.max() - xs.min()), BOX_PAD * (ys.max() - ys.min())

    views = []
    for pad in PADS:
        bx0, by0, bx1, by1 = _crop_box(consensus, pad, (H, W))
        cw, ch = bx1 - bx0, by1 - by0
        local_fg = [(x - bx0, y - by0) for x, y in fg]
        local_bg = [(x - bx0, y - by0) for x, y in bg]
        if not any(0 <= x < cw and 0 <= y < ch for x, y in local_fg):
            continue
        # the hypothesis box as SAM2's box prompt, padded: SAM2 treats a box
        # as a bound, so an unpadded one could never grow past pass 1
        box = (float(xs.min() - bx0 - gx), float(ys.min() - by0 - gy),
               float(xs.max() - bx0 + gx), float(ys.max() - by0 + gy))
        for img in images:
            crop = img.crop((bx0, by0, bx1, by1))
            for fx, fy in FLIPS:
                pf = _flip_points(local_fg, fx, fy, cw, ch)
                pb = [p for p in _flip_points(local_bg, fx, fy, cw, ch) if 0 <= p[0] < cw and 0 <= p[1] < ch]
                fb = _flip_points([box[:2], box[2:]], fx, fy, cw, ch)
                fbox = (min(fb[0][0], fb[1][0]), min(fb[0][1], fb[1][1]),
                        max(fb[0][0], fb[1][0]), max(fb[0][1], fb[1][1]))
                cands = _predict(session, sam2_url, _png(_flip_image(crop, fx, fy)), (cw, ch),
                                 pf + pb, [1] * len(pf) + [0] * len(pb), box=fbox, refine=REFINE_ROUNDS)
                best = max(cands, key=lambda c: c["score"])
                views.append({"box": (bx0, by0, bx1, by1),
                              "prob": (_unflip(best["prob"], fx, fy) * 255 + 0.5).astype(np.uint8)})
    if not views:
        raise SegmentError("no region found at that point; try another spot or add a point")

    # ---- combine: average, drop the views that argue with it, average again ----
    ref = _average(views, list(range(len(views))), (H, W)) >= 0.5
    keep = [i for i, v in enumerate(views)
            if iou(v["prob"] >= 128, ref[v["box"][1]:v["box"][3], v["box"][0]:v["box"][2]]) >= REJECT_IOU]
    if len(keep) < max(2, len(views) // 8):
        keep = list(range(len(views)))  # too few agree to single any out
    prob = _average(views, keep, (H, W))

    # snap the 0.5 crossing onto real edges in the surface; where there are
    # none this degrades to a mild blur
    with Image.open(image_dir / "slope.png") as im:
        guide = np.asarray(im.convert("L"), dtype=np.float32) / 255.0
    prob = np.clip(R.guided_filter(prob, guide, 4, 1e-3), 0.0, 1.0)

    polygon = _outline(largest_blob(prob >= 0.5))
    if len(polygon) < 3:
        raise SegmentError("no region found at that point; try another spot or add a point")
    return [[round(float(x), 1), round(float(y), 1)] for x, y in polygon]
