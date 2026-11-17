import { describe, expect, it } from 'vitest';
import {
  framesEqual,
  transformPointImageToScene,
  transformPointSceneToImage,
  transformShapesBetweenImageFrames,
} from './annotationPlacementTransform';

describe('annotationPlacementTransform (OpenLIME image frames)', () => {
  const identityCentered: Parameters<typeof transformPointImageToScene>[1] = {
    x: 0,
    y: 0,
    rotationDeg: 0,
    scale: 1,
    width: 200,
    height: 100,
  };

  it('round-trips image ↔ scene for identity placement', () => {
    const image: [number, number, number] = [20, 10, 0];
    const scene = transformPointImageToScene(image, identityCentered);
    // image (20,10) → layer (-80, 40) → scene (-80, 40)
    expect(scene.map((n) => Number(n.toFixed(6)))).toEqual([-80, 40, 0]);
    expect(transformPointSceneToImage(scene, identityCentered)).toEqual(image);
  });

  it('accounts for placement similarity when remapping frames', () => {
    const placed = {
      ...identityCentered,
      x: 100,
      y: 50,
      rotationDeg: 90,
      scale: 2,
    };
    // Same image point on the placed asset → different scene than identity frame
    const image: [number, number, number] = [100, 50, 0]; // asset center in image space
    const scene = transformPointImageToScene(image, placed);
    // layer (0,0) → rot90/scale2 → (0,0) + T → (100, 50)
    expect(scene.map((n) => Number(n.toFixed(6)))).toEqual([100, 50, 0]);
    expect(transformPointSceneToImage(scene, placed).map((n) => Number(n.toFixed(6))))
      .toEqual([100, 50, 0]);
  });

  it('keeps shapes unchanged when frames match', () => {
    const shapes = [{ type: 'ShapePoints' as const, vertices: [[15, 2, 0] as [number, number, number]] }];
    expect(transformShapesBetweenImageFrames(shapes, identityCentered, identityCentered)).toBe(shapes);
    expect(framesEqual(identityCentered, identityCentered)).toBe(true);
  });

  it('remaps image coords from a placed frame into an identity frame', () => {
    const placed = { ...identityCentered, x: 100, y: 0, rotationDeg: 0, scale: 1 };
    const shapes = transformShapesBetweenImageFrames(
      [{ type: 'ShapePoints', vertices: [[100, 50, 0]] }],
      placed,
      identityCentered,
    );
    // Center pixel on placed asset → scene (100,0) → identity image (100+100, 50) = (200, 50)? 
    // image (100,50) on placed: layer (0,0) → scene (100, 0)
    // scene (100,0) on identity: layer (100, 0) → image (200, 50)
    expect(shapes[0]!.vertices[0]).toEqual([200, 50, 0]);
  });
});
