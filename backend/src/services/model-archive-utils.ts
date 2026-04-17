import path from 'path';
import fsp from 'fs/promises';

export type DetectedArchiveFileType = '3d-model' | 'rti-info' | 'texture' | 'other';

export interface DetectedArchiveFile {
  name: string;
  path: string;
  type: DetectedArchiveFileType;
}

const MODEL_EXTENSION_PRIORITY = [
  '.glb',
  '.gltf',
  '.obj',
  '.ply',
  '.nxz',
  '.nxs',
  '.stl',
  '.fbx',
  '.dae',
  '.x3d',
  '.3ds',
  '.ase',
  '.ifc',
  '.blend',
];

function normalizeArchivePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function pathDepth(p: string): number {
  const normalized = normalizeArchivePath(p);
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  return normalized.split('/').length;
}

function getModelPriority(fileName: string): number {
  const ext = path.extname(fileName).toLowerCase();
  const idx = MODEL_EXTENSION_PRIORITY.indexOf(ext);
  return idx >= 0 ? idx : MODEL_EXTENSION_PRIORITY.length + 1;
}

/**
 * Pick the primary model file in a deterministic way:
 * 1) by preferred extension
 * 2) shallower path first
 * 3) lexicographical file name
 */
export function selectPrimary3DModelFile(
  files: DetectedArchiveFile[]
): DetectedArchiveFile | null {
  const models = files.filter((f) => f.type === '3d-model');
  if (models.length === 0) return null;

  const sorted = [...models].sort((a, b) => {
    const byExt = getModelPriority(a.name) - getModelPriority(b.name);
    if (byExt !== 0) return byExt;

    const byDepth = pathDepth(a.name) - pathDepth(b.name);
    if (byDepth !== 0) return byDepth;

    return normalizeArchivePath(a.name)
      .toLowerCase()
      .localeCompare(normalizeArchivePath(b.name).toLowerCase());
  });

  return sorted[0] ?? null;
}

function parseObjMtllibRefs(objText: string): string[] {
  const refs: string[] = [];
  const regex = /^\s*mtllib\s+(.+)$/gim;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(objText)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    // OBJ allows multiple libraries in one mtllib line.
    for (const token of raw.split(/\s+/)) {
      const t = token.trim().replace(/^["']|["']$/g, '');
      if (t) refs.push(t);
    }
  }
  return refs;
}

function parseMtlTextureRefs(mtlText: string): string[] {
  const refs: string[] = [];
  const lines = mtlText.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const key = parts[0]?.toLowerCase() ?? '';
    if (
      !key.startsWith('map_') &&
      key !== 'bump' &&
      key !== 'disp' &&
      key !== 'decal' &&
      key !== 'refl' &&
      key !== 'norm'
    ) {
      continue;
    }

    // Keep it robust: for MTL map directives, the texture path is typically the last token.
    const texture = parts[parts.length - 1]?.replace(/^["']|["']$/g, '');
    if (texture) refs.push(texture);
  }

  return refs;
}

function resolveArchiveReference(baseDir: string, reference: string): string {
  const ref = normalizeArchivePath(reference);
  if (!ref) return ref;

  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('data:')) {
    return ref;
  }

  if (reference.startsWith('/')) {
    return ref;
  }

  return normalizeArchivePath(path.posix.normalize(path.posix.join(baseDir, ref)));
}

function makeFileIndex(files: DetectedArchiveFile[]): Map<string, DetectedArchiveFile> {
  const map = new Map<string, DetectedArchiveFile>();
  for (const f of files) {
    map.set(normalizeArchivePath(f.name), f);
  }
  return map;
}

/**
 * Validate OBJ packaging for a specific model file in archive.
 * Returns warnings only; never throws for missing companion files.
 */
export async function collectObjPackagingWarnings(
  files: DetectedArchiveFile[],
  modelFile: DetectedArchiveFile
): Promise<string[]> {
  const warnings = new Set<string>();
  const ext = path.extname(modelFile.name).toLowerCase();
  if (ext !== '.obj') return [];

  let objText = '';
  try {
    objText = await fsp.readFile(modelFile.path, 'utf8');
  } catch {
    warnings.add(`Unable to read OBJ file "${modelFile.name}" for material validation.`);
    return Array.from(warnings);
  }

  const fileIndex = makeFileIndex(files);
  const objDir = path.posix.dirname(normalizeArchivePath(modelFile.name));
  const mtllibRefs = parseObjMtllibRefs(objText);

  if (mtllibRefs.length === 0) {
    warnings.add(
      `OBJ "${modelFile.name}" has no "mtllib" declaration. Model will load with default materials unless textures are embedded elsewhere.`
    );
    return Array.from(warnings);
  }

  for (const mtlRef of mtllibRefs) {
    const mtlArchivePath = resolveArchiveReference(objDir, mtlRef);
    const mtlFile = fileIndex.get(mtlArchivePath);
    if (!mtlFile) {
      warnings.add(
        `OBJ "${modelFile.name}" references MTL "${mtlRef}", but it was not found in the uploaded archive.`
      );
      continue;
    }

    let mtlText = '';
    try {
      mtlText = await fsp.readFile(mtlFile.path, 'utf8');
    } catch {
      warnings.add(`Unable to read MTL "${mtlFile.name}" referenced by OBJ "${modelFile.name}".`);
      continue;
    }

    const mtlDir = path.posix.dirname(normalizeArchivePath(mtlFile.name));
    const textureRefs = parseMtlTextureRefs(mtlText);
    for (const texRef of textureRefs) {
      const texArchivePath = resolveArchiveReference(mtlDir, texRef);
      if (
        texArchivePath.startsWith('http://') ||
        texArchivePath.startsWith('https://') ||
        texArchivePath.startsWith('data:')
      ) {
        continue;
      }

      if (!fileIndex.has(texArchivePath)) {
        warnings.add(
          `MTL "${mtlFile.name}" references texture "${texRef}", but it was not found in the uploaded archive.`
        );
      }
    }
  }

  return Array.from(warnings);
}
