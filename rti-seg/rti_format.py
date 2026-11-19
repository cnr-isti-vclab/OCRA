"""Reader for Relight web-format RTI directories (info.json + DeepZoom planes).

Relight stores a relightable image as per-pixel basis coefficients, packed three
to a JPEG (the R, G, B channels of `plane_N` are coefficients 3N, 3N+1, 3N+2),
each published as a DeepZoom pyramid.

Dequantisation follows the Relight encoder and OpenLIME's ShaderRTI.js:

    value = (byte / 255 - bias) * scale

which is *not* `byte/255 * scale + bias`; that reading makes the signed
higher-order coefficients positive and blows the renders out.
"""

from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

# Basis function counts that rti_render can evaluate, keyed by info.json "type".
BASIS_SIZES = {"ptm": (6,), "hsh": (4, 9), "sh": (4, 9)}
SUPPORTED_COLORSPACES = ("rgb", "lrgb")


class RtiFormatError(Exception):
    """The asset is not an RTI this reader can handle."""


@dataclass
class RtiInfo:
    width: int
    height: int
    type: str
    colorspace: str
    nplanes: int
    njpegs: int
    nbasis: int
    layout: str
    format: str
    scale: np.ndarray  # (nplanes,)
    bias: np.ndarray  # (nplanes,)


def _scale_bias(info: dict, path: Path) -> tuple[list, list]:
    """scale/bias live either at the top level or under materials[0]."""
    if "scale" in info and "bias" in info:
        return info["scale"], info["bias"]
    materials = info.get("materials")
    if isinstance(materials, list) and materials and "scale" in materials[0] and "bias" in materials[0]:
        return materials[0]["scale"], materials[0]["bias"]
    raise RtiFormatError(f"{path}: no 'scale'/'bias' arrays")


def load_info(directory: Path) -> RtiInfo:
    path = Path(directory) / "info.json"
    info = json.loads(path.read_text())
    try:
        width, height, nplanes = int(info["width"]), int(info["height"]), int(info["nplanes"])
        rti_type = str(info["type"]).lower()
    except KeyError as exc:
        raise RtiFormatError(f"{path}: missing {exc}") from exc
    colorspace = str(info.get("colorspace", "rgb")).lower()

    if colorspace not in SUPPORTED_COLORSPACES:
        raise RtiFormatError(f"{path}: colorspace {colorspace!r} is not supported "
                             f"(supported: {SUPPORTED_COLORSPACES})")
    if rti_type not in BASIS_SIZES:
        raise RtiFormatError(f"{path}: type {rti_type!r} is not supported "
                             f"(supported: {sorted(BASIS_SIZES)})")

    # rgb: three colours per basis function; lrgb: a base colour, then luminance
    nbasis = nplanes // 3 if colorspace == "rgb" else nplanes - 3
    if (colorspace == "rgb" and nplanes % 3) or nbasis not in BASIS_SIZES[rti_type]:
        raise RtiFormatError(f"{path}: nplanes={nplanes} does not fit {rti_type}/{colorspace}")

    scale, bias = (np.asarray(a, dtype=np.float64) for a in _scale_bias(info, path))
    if scale.shape != (nplanes,) or bias.shape != (nplanes,):
        raise RtiFormatError(f"{path}: scale/bias do not have {nplanes} entries")

    return RtiInfo(
        width=width,
        height=height,
        type=rti_type,
        colorspace=colorspace,
        nplanes=nplanes,
        njpegs=math.ceil(nplanes / 3),
        nbasis=nbasis,
        layout=str(info.get("layout", "deepzoom")).lower(),
        format=str(info.get("format", "jpg")).lower(),
        scale=scale,
        bias=bias,
    )


@dataclass
class DziParams:
    tile_size: int
    overlap: int
    format: str
    width: int
    height: int


def parse_dzi(dzi_path: Path) -> DziParams:
    """Parse a .dzi descriptor. Namespace-agnostic: Relight and libvips differ."""
    try:
        root = ET.parse(dzi_path).getroot()
        size = next(c for c in root if c.tag.rsplit("}", 1)[-1] == "Size")
        return DziParams(
            tile_size=int(root.attrib["TileSize"]),
            overlap=int(root.attrib["Overlap"]),
            format=root.attrib.get("Format", "jpg").lower(),
            width=int(size.attrib["Width"]),
            height=int(size.attrib["Height"]),
        )
    except (OSError, ET.ParseError, StopIteration, KeyError) as exc:
        raise RtiFormatError(f"{dzi_path}: malformed DZI ({exc!r})") from exc


@dataclass
class Level:
    index: int  # directory name, as an int
    width: int
    height: int
    cols: int
    rows: int


def _discover_levels(files_dir: Path, dzi: DziParams) -> list[Level]:
    """Pyramid levels, smallest first.

    Relight numbers levels 0..N-1 with N-1 at full resolution, which is not the
    standard DeepZoom numbering, so sizes are derived by halving down from the
    top level actually present rather than from the level number.
    """
    nums = sorted(int(p.name) for p in files_dir.iterdir() if p.is_dir() and p.name.isdigit())
    if not nums or nums != list(range(nums[0], nums[0] + len(nums))):
        raise RtiFormatError(f"{files_dir}: missing or non-contiguous level directories")
    levels = []
    for n in nums:
        w = max(1, math.ceil(dzi.width / 2 ** (nums[-1] - n)))
        h = max(1, math.ceil(dzi.height / 2 ** (nums[-1] - n)))
        levels.append(Level(n, w, h, math.ceil(w / dzi.tile_size), math.ceil(h / dzi.tile_size)))
    return levels


def _tile_span(idx: int, size: int, tile_size: int, overlap: int):
    """(dest_start, dest_stop, crop_start, crop_len) of a tile along one axis.

    DeepZoom pads each tile with `overlap` pixels on every side facing another
    tile; get this wrong and every plane shears.
    """
    start = idx * tile_size
    stop = min(start + tile_size, size)
    return start, stop, overlap if idx > 0 else 0, stop - start


class PlaneReader:
    """Dequantised coefficient planes, read in tile-row bands so a large level
    is never held as one float32 (h, w, nplanes) array."""

    def __init__(self, directory: Path, info: RtiInfo):
        self.dir = Path(directory)
        self.info = info

        if info.layout != "deepzoom" or not (self.dir / "plane_0.dzi").is_file():
            raise RtiFormatError(f"{self.dir}: only the 'deepzoom' layout is supported "
                                 f"(info.json says {info.layout!r})")

        self.dzis = []
        for j in range(info.njpegs):
            dzi = parse_dzi(self.dir / f"plane_{j}.dzi")
            if (dzi.width, dzi.height) != (info.width, info.height):
                raise RtiFormatError(f"plane_{j}.dzi size disagrees with info.json")
            if self.dzis and (dzi.tile_size, dzi.overlap) != (self.dzis[0].tile_size, self.dzis[0].overlap):
                raise RtiFormatError(f"plane_{j}.dzi tiling differs from plane_0.dzi")
            self.dzis.append(dzi)

        self.dzi = self.dzis[0]
        self.levels = _discover_levels(self.dir / "plane_0_files", self.dzi)
        self.scale = info.scale.astype(np.float32)
        self.bias = info.bias.astype(np.float32)

    def select_level(self, max_dim: int) -> Level:
        """Smallest level whose long edge is >= max_dim; full resolution if none is."""
        return next((l for l in self.levels if max(l.width, l.height) >= max_dim), self.levels[-1])

    def _read_tile(self, plane: int, level: Level, col: int, row: int) -> np.ndarray:
        ext = self.dzis[plane].format or self.info.format
        tile_path = self.dir / f"plane_{plane}_files" / str(level.index) / f"{col}_{row}.{ext}"
        if not tile_path.is_file():
            matches = list(tile_path.parent.glob(f"{col}_{row}.*"))
            if not matches:
                raise RtiFormatError(f"missing tile {tile_path}")
            tile_path = matches[0]
        with Image.open(tile_path) as im:
            return np.asarray(im.convert("RGB"), dtype=np.uint8)

    def _read_packed_band(self, level: Level, y0: int, y1: int) -> np.ndarray:
        """Raw uint8 (y1-y0, width, njpegs*3) band, tiles stitched and cropped."""
        ts, ov = self.dzi.tile_size, self.dzi.overlap
        out = np.empty((y1 - y0, level.width, self.info.njpegs * 3), dtype=np.uint8)
        for j in range(self.info.njpegs):
            for row in range(y0 // ts, (y1 - 1) // ts + 1):
                ry0, ry1, rcrop, _ = _tile_span(row, level.height, ts, ov)
                by0, by1 = max(ry0, y0), min(ry1, y1)
                if by1 <= by0:
                    continue
                src_y = rcrop + (by0 - ry0)
                for col in range(level.cols):
                    cx0, cx1, ccrop, clen = _tile_span(col, level.width, ts, ov)
                    tile = self._read_tile(j, level, col, row)
                    if tile.shape[0] < src_y + (by1 - by0) or tile.shape[1] < ccrop + clen:
                        raise RtiFormatError(f"plane_{j} level {level.index} tile {col}_{row} "
                                             f"is too small for its overlap")
                    out[by0 - y0:by1 - y0, cx0:cx1, j * 3:j * 3 + 3] = \
                        tile[src_y:src_y + (by1 - by0), ccrop:ccrop + clen]
        return out

    def _dequantise(self, packed: np.ndarray) -> np.ndarray:
        vals = packed[..., :self.info.nplanes].astype(np.float32) * np.float32(1.0 / 255.0)
        vals -= self.bias
        vals *= self.scale
        return vals

    def iter_bands(self, level: Level):
        """Yield (y0, y1, coeffs float32 (band, width, nplanes)), one tile row at a time."""
        ts = self.dzi.tile_size
        for y0 in range(0, level.height, ts):
            y1 = min(y0 + ts, level.height)
            yield y0, y1, self._dequantise(self._read_packed_band(level, y0, y1))

    def read_all(self, level: Level) -> np.ndarray:
        """Whole-level coefficients; only for small levels."""
        return self._dequantise(self._read_packed_band(level, 0, level.height))
