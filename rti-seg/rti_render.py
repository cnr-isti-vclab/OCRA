"""Relighting, photometric stereo and image operators for Relight RTI data.

A relit render is one contraction over the basis dimension, and many lights are
evaluated per call so a band of coefficients only has to be read once.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

# Rec. 709 luminance.
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# OpenLIME clamps the polar angle so grazing lights never hit the degenerate
# sqrt(cosT - cosT^2) = 0 corner of the HSH basis; matching it keeps renders
# consistent with what the viewer shows.
HSH_MIN_ELEVATION = 0.15  # radians


# --------------------------------------------------------------------------
# Basis functions
# --------------------------------------------------------------------------


def _unit(lights: np.ndarray) -> np.ndarray:
    l = np.atleast_2d(np.asarray(lights, dtype=np.float64))
    return l / np.linalg.norm(l, axis=-1, keepdims=True)


def hsh_weights(lights: np.ndarray, nbasis: int) -> np.ndarray:
    """Hemispherical harmonics, order 2 (4 terms) or 3 (9 terms), as in
    OpenLIME's ShaderRTI.js."""
    l = _unit(lights)
    phi = np.mod(np.arctan2(l[:, 1], l[:, 0]), 2 * np.pi)
    theta = np.minimum(np.arccos(np.clip(l[:, 2], -1.0, 1.0)), np.pi / 2 - HSH_MIN_ELEVATION)

    cosP, sinP = np.cos(phi), np.sin(phi)
    cosT = np.cos(theta)
    cosT2 = cosT * cosT
    s = np.sqrt(np.maximum(0.0, cosT - cosT2))
    pi = np.pi

    terms = [
        np.full_like(cosT, 1.0 / np.sqrt(2 * pi)),
        np.sqrt(6 / pi) * (cosP * s),
        np.sqrt(3 / (2 * pi)) * (-1 + 2 * cosT),
        np.sqrt(6 / pi) * (s * sinP),
        np.sqrt(30 / pi) * (np.cos(2 * phi) * (-cosT + cosT2)),
        np.sqrt(30 / pi) * (cosP * (-1 + 2 * cosT) * s),
        np.sqrt(5 / (2 * pi)) * (1 - 6 * cosT + 6 * cosT2),
        np.sqrt(30 / pi) * ((-1 + 2 * cosT) * s * sinP),
        np.sqrt(30 / pi) * ((-cosT + cosT2) * np.sin(2 * phi)),
    ]
    return np.stack(terms[:nbasis], axis=1).astype(np.float32)


def ptm_weights(lights: np.ndarray) -> np.ndarray:
    """Polynomial texture map basis: [1, x, y, x^2, xy, y^2]."""
    l = _unit(lights)
    x, y = l[:, 0], l[:, 1]
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], axis=1).astype(np.float32)


def basis_weights(rti_type: str, lights: np.ndarray, nbasis: int) -> np.ndarray:
    """(nlights, nbasis) float32 weights for the given directions."""
    return ptm_weights(lights) if rti_type == "ptm" else hsh_weights(lights, nbasis)


# --------------------------------------------------------------------------
# Relighting
# --------------------------------------------------------------------------


def render(coeffs: np.ndarray, weights: np.ndarray, colorspace: str, nbasis: int) -> np.ndarray:
    """(..., nplanes) coefficients under (nlights, nbasis) weights -> (..., nlights, 3)."""
    if colorspace == "rgb":
        c = coeffs.reshape(*coeffs.shape[:-1], nbasis, 3)
        return np.einsum("...bc,lb->...lc", c, weights, optimize=True)
    # lrgb: a base colour, scaled by relit luminance
    base, lum = coeffs[..., :3], coeffs[..., 3:3 + nbasis]
    l = np.einsum("...b,lb->...l", lum, weights, optimize=True)
    return l[..., None] * base[..., None, :]


def luminance_coefficients(coeffs: np.ndarray, colorspace: str, nbasis: int) -> np.ndarray:
    """Collapse colour out of the coefficients: (..., nbasis)."""
    if colorspace == "rgb":
        c = coeffs.reshape(*coeffs.shape[:-1], nbasis, 3)
        return np.einsum("...bc,c->...b", c, LUMA, optimize=True)
    base, lum = coeffs[..., :3], coeffs[..., 3:3 + nbasis]
    return lum * (base @ LUMA)[..., None]


def render_luminance(lum_coeffs: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """(..., nbasis) x (nlights, nbasis) -> (..., nlights)."""
    return lum_coeffs @ weights.T


def to_luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb @ LUMA


# --------------------------------------------------------------------------
# Light sampling
# --------------------------------------------------------------------------


def fibonacci_hemisphere(n: int, min_z: float) -> np.ndarray:
    """(n, 3) unit directions spread evenly over the cap z in (min_z, 1]."""
    i = np.arange(n, dtype=np.float64)
    z = min_z + (1.0 - min_z) * (i + 0.5) / n
    r = np.sqrt(np.maximum(0.0, 1.0 - z * z))
    phi = np.pi * (3.0 - np.sqrt(5.0)) * i
    return np.stack([r * np.cos(phi), r * np.sin(phi), z], axis=1)


def ring(count: int, elevation_deg: float) -> np.ndarray:
    """`count` directions evenly spaced in azimuth at a fixed elevation."""
    el = np.radians(elevation_deg)
    az = np.linspace(0.0, 2 * np.pi, count, endpoint=False)
    return np.stack([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.full_like(az, np.sin(el))], axis=1)


# --------------------------------------------------------------------------
# Surface shape
# --------------------------------------------------------------------------


def photometric_stereo(lum_coeffs: np.ndarray, weights: np.ndarray, lights: np.ndarray,
                       trim: float = 0.25, chunk: int = 60_000) -> np.ndarray:
    """(..., nbasis) luminance coefficients -> (P, 3) unit normals, nz >= 0.

    Least squares on I = g . l per pixel, after dropping the brightest and
    darkest `trim` of its observations: specular glints on polished metal would
    otherwise read as tilt, and cast shadows pull the other way. Rendering
    inside the chunk loop keeps the (pixels x lights) matrix from ever being
    materialised.
    """
    lum_coeffs = lum_coeffs.reshape(-1, lum_coeffs.shape[-1])
    lights = np.asarray(lights, dtype=np.float32)
    lo = int(np.floor(len(lights) * trim))
    hi = len(lights) - lo
    eye = np.eye(3, dtype=np.float32) * 1e-6
    out = np.empty((len(lum_coeffs), 3), dtype=np.float32)

    for s in range(0, len(lum_coeffs), chunk):
        block = render_luminance(lum_coeffs[s:s + chunk], weights).astype(np.float32)
        keep = np.argsort(block, axis=1, kind="stable")[:, lo:hi]
        Ik = np.take_along_axis(block, keep, axis=1)
        Lk = lights[keep]

        AtA = np.einsum("pmi,pmj->pij", Lk, Lk, optimize=True) + eye
        Atb = np.einsum("pmi,pm->pi", Lk, Ik, optimize=True)
        # trailing axis keeps this a stack of column vectors under NumPy 2
        g = np.linalg.solve(AtA, Atb[..., None])[..., 0]
        norm = np.linalg.norm(g, axis=1, keepdims=True)
        flat = norm[:, 0] < 1e-8
        n = np.divide(g, norm, out=np.zeros_like(g), where=~flat[:, None])
        n[flat] = (0.0, 0.0, 1.0)
        n[n[:, 2] < 0] *= -1.0  # lights on a hemisphere only see front-facing normals
        out[s:s + chunk] = n
    return out


def smooth_normals(normals: np.ndarray, strength: float) -> np.ndarray:
    """Knock JPEG speckle out of a normal field without rounding off edges:
    each component is self-guided filtered, then the field is renormalised."""
    radius = max(1, int(round(2.0 * strength)))
    eps = 1e-3 * strength * strength

    out = np.empty_like(normals)
    for c in range(3):
        ch = normals[..., c].astype(np.float32)
        out[..., c] = guided_filter(ch, ch, radius, eps)

    n = np.linalg.norm(out, axis=-1, keepdims=True)
    out = np.divide(out, n, out=np.zeros_like(out), where=n > 1e-8)
    out[n[..., 0] <= 1e-8] = (0.0, 0.0, 1.0)
    out[out[..., 2] < 0] *= -1.0
    return out


def integrate_height(normals: np.ndarray) -> np.ndarray:
    """Normal field (H, W, 3) -> relative height (H, W), by Frankot-Chellappa:
    the least-squares integrable surface, one division in Fourier space."""
    h, w = normals.shape[:2]
    nz = np.clip(normals[..., 2], 1e-3, None)
    P = np.fft.fft2(-normals[..., 0] / nz)
    Q = np.fft.fft2(-normals[..., 1] / nz)
    wx = np.fft.fftfreq(w).reshape(1, w) * (2 * np.pi)
    wy = np.fft.fftfreq(h).reshape(h, 1) * (2 * np.pi)
    denom = wx**2 + wy**2
    denom[0, 0] = 1.0
    Z = (-1j * wx * P - 1j * wy * Q) / denom
    Z[0, 0] = 0.0
    return np.real(np.fft.ifft2(Z)).astype(np.float32)


def detrend(height: np.ndarray, sigma: float) -> np.ndarray:
    """Height minus its own large-scale shape (a coin's dome), leaving the relief."""
    return height - ndimage.gaussian_filter(height, sigma, mode="nearest")


def principal_components(stack: np.ndarray, k: int) -> np.ndarray:
    """(H, W, L) luminance stack -> (H, W, k) principal components.

    The sweep is one surface relit L times, so its images are near-duplicates;
    the components carry what it knows without the redundancy. Each sign is
    fixed to correlate with the mean image so the output is stable run to run.
    """
    h, w, L = stack.shape
    X = stack.reshape(-1, L).astype(np.float32)
    X = X - X.mean(axis=0, keepdims=True)
    vals, vecs = np.linalg.eigh((X.T @ X) / max(X.shape[0] - 1, 1))
    vecs = vecs[:, np.argsort(vals)[::-1][:k]]
    proj = X @ vecs
    sign = np.sign((proj * X.mean(axis=1, keepdims=True)).sum(axis=0))
    sign[sign == 0] = 1.0
    return (proj * sign).reshape(h, w, k).astype(np.float32)


# --------------------------------------------------------------------------
# Image operators
# --------------------------------------------------------------------------


def guided_filter(src: np.ndarray, guide: np.ndarray, radius: int, eps: float) -> np.ndarray:
    """Edge-preserving smoothing (He et al. 2010), box-filter implementation."""
    box = lambda a: ndimage.uniform_filter(a, size=2 * radius + 1, mode="nearest")
    mean_g = box(guide)
    mean_s = box(src)
    a = (box(guide * src) - mean_g * mean_s) / (box(guide * guide) - mean_g * mean_g + eps)
    b = mean_s - a * mean_g
    return box(a) * guide + box(b)


def sobel_energy(lum: np.ndarray) -> float:
    """RMS Sobel gradient magnitude: how much visible relief an image shows."""
    gx = ndimage.sobel(lum, axis=1, mode="nearest")
    gy = ndimage.sobel(lum, axis=0, mode="nearest")
    return float(np.sqrt(np.mean(gx * gx + gy * gy)))


def normalise_scores(values: np.ndarray) -> np.ndarray:
    """Min-max to [0, 1] across a candidate set; a flat set scores 0."""
    v = np.asarray(values, dtype=np.float64)
    lo, hi = v.min(), v.max()
    return np.zeros_like(v) if hi - lo < 1e-12 else (v - lo) / (hi - lo)


def encode_normals(normals: np.ndarray) -> np.ndarray:
    """float normals -> uint8 RGB, R=(nx+1)/2, G=(ny+1)/2, B=nz."""
    out = np.empty(normals.shape, dtype=np.float32)
    out[..., 0] = (normals[..., 0] + 1.0) * 0.5
    out[..., 1] = (normals[..., 1] + 1.0) * 0.5
    out[..., 2] = normals[..., 2]
    return to_uint8(out)


def to_uint8(img: np.ndarray) -> np.ndarray:
    return (np.clip(img, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
