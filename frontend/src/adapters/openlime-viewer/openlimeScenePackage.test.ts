import { describe, expect, it } from 'vitest';
import type { DigitalAsset } from '../../routes/HDTPage.tsx';
import {
  buildMinimalOpenLimeScene,
  isOpenLimeAssetPackage,
  modelToOpenLimeTransform,
  formatOpenLimeSceneLoadError,
  openLimeAssetDocumentUrl,
  packageBaseUrlFromDocumentUrl,
  resolveOpenLimeSourceUrl,
  siblingOpenLimeAssetDocumentUrl,
  toOpenLimeInstanceId,
} from './openlimeScenePackage';

function asset(partial: Partial<DigitalAsset> & Pick<DigitalAsset, 'id'>): DigitalAsset {
  return {
    type: 'rti',
    label: 'A',
    uploadedAt: '2020-01-01',
    uploadedBy: 'u',
    ...partial,
  } as DigitalAsset;
}

describe('openlimeScenePackage', () => {
  it('detects asset.json entry points and metadata URLs', () => {
    expect(isOpenLimeAssetPackage(asset({
      id: 'a1',
      entryPointUrl: '/assets/projects/p/rti/a1/info.json',
    }))).toBe(false);
    expect(openLimeAssetDocumentUrl(asset({
      id: 'a1',
      entryPointUrl: '/assets/projects/p/rti/a1/asset.json',
    }))).toBe('/assets/projects/p/rti/a1/asset.json');
    expect(openLimeAssetDocumentUrl(asset({
      id: 'a1',
      entryPointUrl: '/assets/projects/p/rti/a1/info.json',
      metadata: { openLimeAssetUrl: '/assets/projects/p/rti/a1/asset.json' },
    }))).toBe('/assets/projects/p/rti/a1/asset.json');
    expect(siblingOpenLimeAssetDocumentUrl(asset({
      id: 'a1',
      entryPointUrl: '/assets/projects/p/rti/a1/info.json',
    }))).toBe('/assets/projects/p/rti/a1/asset.json');
  });

  it('resolves relative source URIs against the package folder', () => {
    const base = packageBaseUrlFromDocumentUrl('http://localhost:3002/assets/projects/p/rti/a1/asset.json');
    expect(base).toBe('http://localhost:3002/assets/projects/p/rti/a1/');
    expect(resolveOpenLimeSourceUrl({ uri: 'info.json' }, base)).toBe(
      'http://localhost:3002/assets/projects/p/rti/a1/info.json',
    );
  });

  it('builds a minimal multi-instance openlime-scene', () => {
    const scene = buildMinimalOpenLimeScene({
      sceneId: 'wall',
      instances: [
        {
          instanceId: 'left',
          assetId: 'urn:example:lime',
          transform: { type: 'similarity2d', translation: [-10, 0], rotation: 0, scale: 1 },
        },
        {
          instanceId: 'right',
          assetId: 'urn:example:lime',
          transform: { type: 'identity' },
        },
      ],
    });
    expect(scene.format).toBe('openlime-scene');
    expect(scene.assets).toHaveLength(2);
    expect(scene.assets[0]?.asset).toBe('urn:example:lime');
    expect(scene.id).toContain('wall');
  });

  it('formats SceneValidationError diagnostics for the user', () => {
    const error = Object.assign(new Error('fallback'), {
      name: 'SceneValidationError',
      diagnostics: [
        { severity: 'warning', path: '/x', message: 'ignored' },
        { severity: 'error', path: '/nodes/rti/spatial', message: 'Invalid transform.' },
        { severity: 'error', path: '/id', message: 'Asset id must be a URI or URN.' },
      ],
    });
    expect(formatOpenLimeSceneLoadError(error)).toBe(
      '/nodes/rti/spatial: Invalid transform.\n/id: Asset id must be a URI or URN.',
    );
  });

  it('maps model transforms and sanitizes instance ids', () => {
    expect(modelToOpenLimeTransform({ id: 'm', file: 'x' })).toEqual({ type: 'identity' });
    expect(modelToOpenLimeTransform({
      id: 'm',
      file: 'x',
      position: [2, 3, 0],
      rotation: [0, 0, 90],
      rotationUnits: 'deg',
      scale: 2,
    })).toEqual({
      type: 'similarity2d',
      translation: [2, 3],
      rotation: 90,
      scale: 2,
    });
    expect(toOpenLimeInstanceId('left')).toBe('left');
    expect(toOpenLimeInstanceId('9bad')).toBe('i_9bad');
  });
});
