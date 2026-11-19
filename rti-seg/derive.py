"""Render an RTI asset into the images segment.py runs SAM2 on.

On a coin or bas-relief, figure and ground are the same material, so a flat
image barely contains the boundary: it is a change in surface slope. Each image
here shows that geometry a different way, and segment.py only keeps a boundary
that holds across all of them.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

import rti_format as F
import rti_render as R

# Written as <name>.png. segment.py pools over these, in this order.
VOTERS = ("height", "cavity", "pca_1", "pca_2", "pca_3", "slope", "light_range", "normals", "best_light")

SWEEP_COUNT = 12  # renders round the object, for light_range and pca
SWEEP_ELEVATION = 25.0  # degrees above the horizon: grazing, so relief casts contrast
N_SCORE_LIGHTS = 200  # candidate directions for best_light
N_STEREO_LIGHTS = 80  # directions for photometric stereo
MIN_LIGHT_Z = 0.1
BEST_LIGHT_ALPHA = 0.65  # best_light score: weight of edge contrast vs brightness
NORMAL_SMOOTH = 1.0
# height is detrended at this fraction of the short side: removes a coin's dome,
# keeps the relief on it
DETREND_FRACTION = 0.02
# cavity looks for recesses at these fractions of the short side, so a stamped
# letter and a sunken field show up in the same image
CAVITY_SCALES = (0.004, 0.008, 0.016, 0.032)


def _scoring_level(reader: F.PlaneReader, target: F.Level) -> F.Level:
    """A small level to score the candidate lights cheaply."""
    for l in reader.levels:
        if max(l.width, l.height) >= 256:
            return l if l.index <= target.index else target
    return reader.levels[-1]


def _best_light(reader: F.PlaneReader, info: F.RtiInfo, level: F.Level) -> np.ndarray:
    """The most informative light direction: edge contrast plus brightness.

    The edge term is divided by the render's own brightness. Raw gradient
    energy grows with brightness, so without that the winner is a near-vertical
    light, which hides relief rather than showing it.
    """
    lights = R.fibonacci_hemisphere(N_SCORE_LIGHTS, MIN_LIGHT_Z)
    weights = R.basis_weights(info.type, lights, info.nbasis)
    lum_coeffs = R.luminance_coefficients(reader.read_all(level), info.colorspace, info.nbasis)
    lum = R.render_luminance(lum_coeffs, weights)  # (h, w, nlights)

    sharp = np.array([R.sobel_energy(lum[..., i]) for i in range(len(lights))])
    bright = lum.reshape(-1, len(lights)).mean(axis=0)
    score = (BEST_LIGHT_ALPHA * R.normalise_scores(sharp / np.maximum(bright, 1e-6))
             + (1.0 - BEST_LIGHT_ALPHA) * R.normalise_scores(bright))
    return lights[int(np.argmax(score))]


def _stretch(img: np.ndarray) -> np.ndarray:
    """To uint8 over the 1st-99th percentile, so a few extreme pixels at the
    border do not own the whole range."""
    lo, hi = np.percentile(img, (1.0, 99.0))
    return R.to_uint8((img - lo) / max(float(hi - lo), 1e-6))


def derive(asset_dir: Path, out_dir: Path, max_dim: int) -> None:
    """Write every VOTERS image for the asset, at the smallest pyramid level
    whose long side is at least max_dim."""
    info = F.load_info(asset_dir)
    reader = F.PlaneReader(asset_dir, info)
    level = reader.select_level(max_dim)
    W, H = level.width, level.height

    best_dir = _best_light(reader, info, _scoring_level(reader, level))
    render_weights = R.basis_weights(
        info.type, np.vstack([R.ring(SWEEP_COUNT, SWEEP_ELEVATION), best_dir]), info.nbasis)
    stereo_lights = R.fibonacci_hemisphere(N_STEREO_LIGHTS, MIN_LIGHT_Z)
    stereo_weights = R.basis_weights(info.type, stereo_lights, info.nbasis)

    light_range = np.empty((H, W), dtype=np.float32)
    sweep = np.empty((H, W, SWEEP_COUNT), dtype=np.float32)
    best = np.empty((H, W, 3), dtype=np.float32)
    normals = np.empty((H, W, 3), dtype=np.float32)

    # One pass over the coefficients, in row slices of ~32 MB of render output
    # so peak memory stays bounded on large levels.
    rows = max(8, min(reader.dzi.tile_size, int(32e6 / max(1, W * len(render_weights) * 3 * 4))))
    for y0, y1, coeffs in reader.iter_bands(level):
        for a in range(y0, y1, rows):
            b = min(a + rows, y1)
            sub = coeffs[a - y0:b - y0]
            rendered = R.render(sub, render_weights, info.colorspace, info.nbasis)
            lum = R.to_luminance(rendered[..., :SWEEP_COUNT, :])
            # how far each pixel's brightness swings as the light goes round: a
            # flat facet barely changes, a relief flank goes from lit to shadow
            light_range[a:b] = lum.max(axis=-1) - lum.min(axis=-1)
            sweep[a:b] = lum
            best[a:b] = rendered[..., -1, :]
            lum_coeffs = R.luminance_coefficients(sub, info.colorspace, info.nbasis)
            normals[a:b] = R.photometric_stereo(lum_coeffs, stereo_weights, stereo_lights).reshape(b - a, W, 3)

    normals = R.smooth_normals(normals, NORMAL_SMOOTH)
    # 1 - nz: tilt without direction. Flat ground goes black and every relief
    # flank bright, where the normal map's direction sweeps across a whole dome.
    slope = 1.0 - np.clip(normals[..., 2], -1.0, 1.0)
    # the integral of the normals: a stamped figure is a filled plateau rather
    # than slope's outline
    height = R.detrend(R.integrate_height(normals), DETREND_FRACTION * min(H, W))
    # how far each pixel sits below its neighbourhood, pooled over several scales
    cavity = np.zeros_like(height)
    for f in CAVITY_SCALES:
        cavity += ndimage.gaussian_filter(height, max(1.0, f * min(H, W)), mode="nearest") - height
    cavity /= len(CAVITY_SCALES)
    pca = R.principal_components(sweep, 3)

    images = {
        "height": _stretch(height),
        "cavity": _stretch(cavity),
        "pca_1": _stretch(pca[..., 0]),
        "pca_2": _stretch(pca[..., 1]),
        "pca_3": _stretch(pca[..., 2]),
        "slope": R.to_uint8(slope / max(float(np.percentile(slope, 99.5)), 1e-6)),
        "light_range": R.to_uint8(light_range),
        "normals": R.encode_normals(normals),
        "best_light": R.to_uint8(best),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in VOTERS:
        Image.fromarray(images[name]).save(out_dir / f"{name}.png")
