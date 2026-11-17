import { describe, expect, it } from 'vitest';
import {
  transformPointImageToScene,
  transformPointSceneToImage,
  transformShapesAssetImageToScene,
  transformShapesSceneToAssetImage,
} from './annotationPlacementTransform';

describe('annotationPlacementTransform (scene ↔ asset image)', () => {
  const identityCentered = {
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

  it('accounts for placement similarity', () => {
    const placed = {
      ...identityCentered,
      x: 100,
      y: 50,
      rotationDeg: 90,
      scale: 2,
    };
    const image: [number, number, number] = [100, 50, 0]; // asset center
    const scene = transformPointImageToScene(image, placed);
    expect(scene.map((n) => Number(n.toFixed(6)))).toEqual([100, 50, 0]);
    expect(transformPointSceneToImage(scene, placed).map((n) => Number(n.toFixed(6))))
      .toEqual([100, 50, 0]);
  });

  it('persists OpenLIME scene coords into asset image space', () => {
    const placed = { ...identityCentered, x: 100, y: 0, rotationDeg: 0, scale: 1 };
    const shapes = transformShapesSceneToAssetImage(
      [{ type: 'ShapePoints', vertices: [[100, 0, 0]] }],
      placed,
    );
    // scene (100,0) → layer (0,0) → image (100, 50)
    expect(shapes[0]!.vertices[0]).toEqual([100, 50, 0]);
    expect(transformShapesAssetImageToScene(shapes, placed)[0]!.vertices[0]).toEqual([100, 0, 0]);
  });
});
