import type { SceneDescription } from '../../../../shared/scene-types';
import type { DigitalAsset } from '../../routes/HDTPage';

export interface Sam2SourceImage {
  blob: Blob;
  usedCanvasCapture: boolean;
  trueWidth: number | null;
  trueHeight: number | null;
}

const PLANE_FILENAME_CANDIDATES = ['plane_0.jpg', 'plane_0.jpeg', 'plane_0.png', 'plane.jpg', 'image.jpg'];

function findRtiAssetBase(
  sceneDesc: SceneDescription | null,
  digitalAssets: readonly DigitalAsset[],
): string | null {
  if (!sceneDesc) return null;
  for (const model of sceneDesc.models) {
    const asset = digitalAssets.find((a) => a.id === model.id);
    if (asset?.entryPointUrl != null && asset.type === 'rti') {
      const resolved = new URL(asset.entryPointUrl, window.location.href);
      resolved.search = '';
      resolved.hash = '';
      resolved.pathname = resolved.pathname.replace(/\/[^/]*$/, '/');
      return resolved.toString();
    }
  }
  return null;
}

async function tryFetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (response.ok) return await response.blob();
  } catch {
    // try next candidate
  }
  return null;
}

async function findDeepzoomPreview(assetBase: string): Promise<Sam2SourceImage | null> {
  try {
    const dziResp = await fetch(`${assetBase}plane_0.dzi`, { credentials: 'include' });
    if (!dziResp.ok) return null;
    const dziText = await dziResp.text();
    const wMatch = dziText.match(/Width="(\d+)"/i);
    const hMatch = dziText.match(/Height="(\d+)"/i);
    if (!wMatch || !hMatch) return null;

    const trueWidth = parseInt(wMatch[1]);
    const trueHeight = parseInt(hMatch[1]);
    const tileSize = parseInt(dziText.match(/TileSize="(\d+)"/i)?.[1] ?? '256');
    const tileExt = dziText.match(/Format="([^"]+)"/i)?.[1] ?? 'jpg';
    const maxLevel = Math.ceil(Math.log2(Math.max(trueWidth, trueHeight)));
    const levelShift = Math.ceil(Math.log2(Math.max(trueWidth, trueHeight) / tileSize));
    const previewLevel = Math.min(maxLevel, Math.max(0, maxLevel - levelShift));

    for (const level of [previewLevel, Math.max(0, previewLevel - 1), previewLevel + 1]) {
      for (const ext of [tileExt, 'jpg', 'jpeg', 'png']) {
        const blob = await tryFetchBlob(`${assetBase}plane_0_files/${level}/0_0.${ext}`);
        if (blob) return { blob, usedCanvasCapture: false, trueWidth, trueHeight };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export async function findSam2SourceImage(
  sceneDesc: SceneDescription | null,
  digitalAssets: readonly DigitalAsset[],
  captureFallback: () => Promise<Blob | null>,
): Promise<Sam2SourceImage> {
  const assetBase = findRtiAssetBase(sceneDesc, digitalAssets);

  if (assetBase) {
    for (const name of PLANE_FILENAME_CANDIDATES) {
      const blob = await tryFetchBlob(`${assetBase}${name}`);
      if (blob) return { blob, usedCanvasCapture: false, trueWidth: null, trueHeight: null };
    }

    const deepzoom = await findDeepzoomPreview(assetBase);
    if (deepzoom) return deepzoom;
  }

  const captured = await captureFallback();
  if (captured) {
    return { blob: captured, usedCanvasCapture: true, trueWidth: null, trueHeight: null };
  }

  throw new Error(
    'No preview image found for this RTI asset. SAM2 requires an accessible image file. ' +
    'Check that the SAM2 service is running and the asset files are readable.',
  );
}
