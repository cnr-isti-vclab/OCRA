import path from 'path';
import os from 'os';
import fsp from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RTI_DATASET_INFO_FILE,
  isRtiZipPackage,
  prepareAssetProcessingFromLocalFile,
  resolveRtiDatasetRootRelativePath,
} from '../services/asset-ingestion.service.js';

const execFileAsync = promisify(execFile);

async function createTempDir(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fsp.writeFile(filePath, JSON.stringify(value), 'utf8');
}

async function createZipFromDirectory(sourceDir: string, zipPath: string): Promise<void> {
  await execFileAsync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir });
}

describe('asset ingestion RTI ZIP detection', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => fsp.rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  it('ignores directory placeholder entries when resolving the RTI dataset root', () => {
    expect(
      resolveRtiDatasetRootRelativePath([
        'coin_hsh/',
        'coin_hsh/plane_0.dzi',
        `coin_hsh/${RTI_DATASET_INFO_FILE}`,
      ]),
    ).toBe('coin_hsh');
  });

  it('detects RTI packages from info.json in the ZIP central directory', async () => {
    const workingDir = await createTempDir('ocra-rti-zip-');
    const archiveDir = await createTempDir('ocra-rti-archive-');
    tempDirs.push(workingDir);
    tempDirs.push(archiveDir);

    await writeJson(path.join(workingDir, RTI_DATASET_INFO_FILE), { layout: 'image' });
    await fsp.writeFile(path.join(workingDir, 'plane_0.jpg'), 'fake-jpeg', 'utf8');

    const zipPath = path.join(archiveDir, 'dataset.zip');
    await createZipFromDirectory(workingDir, zipPath);

    await expect(isRtiZipPackage(zipPath)).resolves.toBe(true);

    const prepared = await prepareAssetProcessingFromLocalFile({
      file: {
        path: zipPath,
        originalname: 'dataset.zip',
        mimetype: 'application/zip',
      },
    });

    expect(prepared.type).toBe('rti');
  });

  it('keeps ZIPs without info.json in the 3D path', async () => {
    const workingDir = await createTempDir('ocra-3d-zip-');
    const archiveDir = await createTempDir('ocra-3d-archive-');
    tempDirs.push(workingDir);
    tempDirs.push(archiveDir);

    await fsp.writeFile(path.join(workingDir, 'model.glb'), 'fake-glb', 'utf8');

    const zipPath = path.join(archiveDir, 'model.zip');
    await createZipFromDirectory(workingDir, zipPath);

    await expect(isRtiZipPackage(zipPath)).resolves.toBe(false);

    const prepared = await prepareAssetProcessingFromLocalFile({
      file: {
        path: zipPath,
        originalname: 'model.zip',
        mimetype: 'application/zip',
      },
    });

    expect(prepared.type).toBe('3d');
  });

  it('accepts direct GLB downloads even when the filename has no extension', async () => {
    const workingDir = await createTempDir('ocra-direct-glb-');
    tempDirs.push(workingDir);

    const glbPath = path.join(workingDir, 'downloaded-asset');
    const glbHeader = Buffer.alloc(20);
    glbHeader.write('glTF', 0, 'ascii');
    glbHeader.writeUInt32LE(2, 4);
    glbHeader.writeUInt32LE(glbHeader.length, 8);
    await fsp.writeFile(glbPath, glbHeader);

    const prepared = await prepareAssetProcessingFromLocalFile({
      file: {
        path: glbPath,
        originalname: 'downloaded-asset',
        mimetype: 'application/octet-stream',
      },
    });

    expect(prepared.type).toBe('3d-direct');
  });

  it('accepts directly viewable raster images', async () => {
    const workingDir = await createTempDir('ocra-direct-image-');
    tempDirs.push(workingDir);

    const imagePath = path.join(workingDir, 'condition-map.png');
    await fsp.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const prepared = await prepareAssetProcessingFromLocalFile({
      file: {
        path: imagePath,
        originalname: 'condition-map.png',
        mimetype: 'image/png',
      },
    });

    expect(prepared.type).toBe('image-direct');
  });

  it('accepts ZIPs with a single top-level directory wrapping the RTI dataset', async () => {
    const workingDir = await createTempDir('ocra-rti-legacy-');
    const archiveDir = await createTempDir('ocra-rti-legacy-archive-');
    tempDirs.push(workingDir);
    tempDirs.push(archiveDir);

    const nestedDir = path.join(workingDir, 'nested');
    await fsp.mkdir(nestedDir, { recursive: true });
    await writeJson(path.join(nestedDir, RTI_DATASET_INFO_FILE), { layout: 'image' });
    await fsp.writeFile(path.join(nestedDir, 'plane_0.jpg'), 'fake-jpeg', 'utf8');

    const zipPath = path.join(archiveDir, 'legacy-rti.zip');
    await createZipFromDirectory(workingDir, zipPath);

    await expect(isRtiZipPackage(zipPath)).resolves.toBe(true);

    const prepared = await prepareAssetProcessingFromLocalFile({
      file: {
        path: zipPath,
        originalname: 'legacy-rti.zip',
        mimetype: 'application/zip',
      },
    });

    expect(prepared.type).toBe('rti');
    expect(prepared.rtiDatasetRootRelativePath).toBe('nested');
  });

  it('rejects ZIPs with multiple top-level roots around info.json', async () => {
    const workingDir = await createTempDir('ocra-rti-ambiguous-');
    const archiveDir = await createTempDir('ocra-rti-ambiguous-archive-');
    tempDirs.push(workingDir);
    tempDirs.push(archiveDir);

    const firstDir = path.join(workingDir, 'a');
    const secondDir = path.join(workingDir, 'b');
    await fsp.mkdir(firstDir, { recursive: true });
    await fsp.mkdir(secondDir, { recursive: true });
    await writeJson(path.join(firstDir, RTI_DATASET_INFO_FILE), { layout: 'image' });
    await fsp.writeFile(path.join(secondDir, 'plane_0.jpg'), 'fake-jpeg', 'utf8');

    const zipPath = path.join(archiveDir, 'ambiguous-rti.zip');
    await createZipFromDirectory(workingDir, zipPath);

    await expect(isRtiZipPackage(zipPath)).resolves.toBe(false);
    await expect(
      prepareAssetProcessingFromLocalFile({
        file: {
          path: zipPath,
          originalname: 'ambiguous-rti.zip',
          mimetype: 'application/zip',
        },
      }),
    ).rejects.toThrow(`ZIP archive contains neither RTI package entry point (${RTI_DATASET_INFO_FILE}) nor 3D models`);
  });
});
