import os from 'os';
import path from 'path';
import fsp from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectObjPackagingWarnings,
  selectPrimary3DModelFile,
  type DetectedArchiveFile
} from './model-archive-utils.js';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ocra-model-archive-test-'));
  tempDirs.push(dir);
  return dir;
}

async function writeFile(baseDir: string, relPath: string, content: string): Promise<string> {
  const abs = path.join(baseDir, relPath);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, 'utf8');
  return abs;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => fsp.rm(d, { recursive: true, force: true }))
  );
});

describe('model-archive-utils', () => {
  it('valid OBJ+MTL+texture package returns no warnings', async () => {
    const dir = await makeTempDir();
    const objPath = await writeFile(
      dir,
      'model.obj',
      [
        'mtllib materials/model.mtl',
        'o test',
        'v 0 0 0',
        'v 1 0 0',
        'v 0 1 0',
        'f 1 2 3'
      ].join('\n')
    );
    const mtlPath = await writeFile(
      dir,
      'materials/model.mtl',
      [
        'newmtl material_0',
        'Kd 1.0 1.0 1.0',
        'map_Kd textures/diffuse.jpg'
      ].join('\n')
    );
    const texPath = await writeFile(dir, 'materials/textures/diffuse.jpg', 'dummy');

    const files: DetectedArchiveFile[] = [
      { name: 'model.obj', path: objPath, type: '3d-model' },
      { name: 'materials/model.mtl', path: mtlPath, type: 'other' },
      { name: 'materials/textures/diffuse.jpg', path: texPath, type: 'texture' }
    ];

    const primary = selectPrimary3DModelFile(files);
    expect(primary?.name).toBe('model.obj');

    const warnings = await collectObjPackagingWarnings(files, primary!);
    expect(warnings).toEqual([]);
  });

  it('OBJ archive with missing MTL returns warning', async () => {
    const dir = await makeTempDir();
    const objPath = await writeFile(
      dir,
      'scene/model.obj',
      [
        'mtllib missing/materials.mtl',
        'o test',
        'v 0 0 0',
        'v 1 0 0',
        'v 0 1 0',
        'f 1 2 3'
      ].join('\n')
    );

    const files: DetectedArchiveFile[] = [
      { name: 'scene/model.obj', path: objPath, type: '3d-model' }
    ];

    const warnings = await collectObjPackagingWarnings(files, files[0]);
    expect(warnings.some((w) => w.includes('references MTL'))).toBe(true);
  });

  it('OBJ archive with missing texture returns warning', async () => {
    const dir = await makeTempDir();
    const objPath = await writeFile(
      dir,
      'obj/model.obj',
      [
        'mtllib model.mtl',
        'o test',
        'v 0 0 0',
        'v 1 0 0',
        'v 0 1 0',
        'f 1 2 3'
      ].join('\n')
    );
    const mtlPath = await writeFile(
      dir,
      'obj/model.mtl',
      [
        'newmtl material_0',
        'Kd 1.0 1.0 1.0',
        'map_Kd textures/missing.jpg'
      ].join('\n')
    );

    const files: DetectedArchiveFile[] = [
      { name: 'obj/model.obj', path: objPath, type: '3d-model' },
      { name: 'obj/model.mtl', path: mtlPath, type: 'other' }
    ];

    const warnings = await collectObjPackagingWarnings(files, files[0]);
    expect(warnings.some((w) => w.includes('references texture'))).toBe(true);
  });

  it('multiple OBJ files select deterministic primary entrypoint', async () => {
    const dir = await makeTempDir();
    const objAPath = await writeFile(dir, 'b.obj', 'o a\nv 0 0 0\n');
    const objBPath = await writeFile(dir, 'a.obj', 'o b\nv 0 0 0\n');
    const nestedObjPath = await writeFile(dir, 'nested/c.obj', 'o c\nv 0 0 0\n');

    const files: DetectedArchiveFile[] = [
      { name: 'b.obj', path: objAPath, type: '3d-model' },
      { name: 'a.obj', path: objBPath, type: '3d-model' },
      { name: 'nested/c.obj', path: nestedObjPath, type: '3d-model' }
    ];

    const primary = selectPrimary3DModelFile(files);
    expect(primary?.name).toBe('a.obj');
  });
});
