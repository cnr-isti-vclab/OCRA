export type SceneSpatialMode = '2D' | '3D';

export type SceneSpatialAssetRef = { assetId: string };
export type SceneSpatialAsset = { id: string; type: string };
export type SceneSpatialScene = {
  type?: string;
  assets?: SceneSpatialAssetRef[];
};

/** Map a digital-asset type to the spatial mode it belongs to. */
export function assetSpatialKind(type: string): SceneSpatialMode | null {
  if (type === '3d-model') return '3D';
  if (type === 'rti' || type === 'image') return '2D';
  return null;
}

function modeFromSceneAssets(
  scene: SceneSpatialScene,
  digitalAssets: SceneSpatialAsset[],
): SceneSpatialMode | null {
  const byId = new Map(digitalAssets.map((asset) => [asset.id, asset]));
  let saw2d = false;
  for (const ref of scene.assets || []) {
    const kind = assetSpatialKind(byId.get(ref.assetId)?.type ?? '');
    if (kind === '3D') return '3D';
    if (kind === '2D') saw2d = true;
  }
  return saw2d ? '2D' : null;
}

/**
 * Resolve whether a scene is 2D or 3D.
 * Uses scene.type when present, but if in-scene assets clearly disagree
 * (e.g. type defaulted to 3D while only RTI/image are present), trusts the assets.
 */
export function resolveSceneSpatialMode(
  scene: SceneSpatialScene,
  digitalAssets: SceneSpatialAsset[],
): SceneSpatialMode | null {
  const fromAssets = modeFromSceneAssets(scene, digitalAssets);
  if (scene.type === '2D' || scene.type === '3D') {
    if (fromAssets && fromAssets !== scene.type) return fromAssets;
    return scene.type;
  }
  return fromAssets;
}

/** Whether an asset may be added to a scene with the given spatial mode. */
export function isAssetCompatibleWithSceneMode(
  assetType: string,
  mode: SceneSpatialMode | null,
): boolean {
  const kind = assetSpatialKind(assetType);
  if (!kind) return false;
  if (!mode) return true;
  return kind === mode;
}
