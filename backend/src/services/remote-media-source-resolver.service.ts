const KNOWN_3D_EXTENSIONS = [
  '.glb',
  '.gltf',
  '.ply',
  '.obj',
  '.fbx',
  '.dae',
  '.x3d',
  '.stl',
  '.3ds',
] as const;

interface ZenodoApiFileLinks {
  self?: unknown;
  content?: unknown;
}

interface ZenodoApiFile {
  key?: unknown;
  filename?: unknown;
  links?: unknown;
}

interface ZenodoApiRecord {
  files?: unknown;
}

function hasSupported3dExtension(value: string): boolean {
  const lower = value.toLowerCase();
  return KNOWN_3D_EXTENSIONS.some((extension) => lower.includes(extension));
}

function extractHttpUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s"'<>]+/g);
  return matches ?? [];
}

function normalizeCandidateUrl(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isZenodoApiFile(value: unknown): value is ZenodoApiFile {
  return isRecord(value);
}

function extractZenodoFileUrl(file: ZenodoApiFile): string | null {
  const explicitName =
    typeof file.filename === 'string'
      ? file.filename
      : typeof file.key === 'string'
        ? file.key
        : null;

  const links = isRecord(file.links) ? (file.links as ZenodoApiFileLinks) : undefined;
  const contentUrl = typeof links?.content === 'string' ? links.content : undefined;
  const selfUrl = typeof links?.self === 'string' ? links.self : undefined;
  const preferredUrl = contentUrl ?? selfUrl ?? null;

  if (preferredUrl && hasSupported3dExtension(preferredUrl)) {
    return preferredUrl;
  }

  if (preferredUrl && explicitName && hasSupported3dExtension(explicitName)) {
    return preferredUrl;
  }

  return null;
}

function extractEmbeddedViewerTarget(url: URL): string | null {
  const candidates = new Set<string>();

  for (const [key, value] of url.searchParams.entries()) {
    candidates.add(key);
    candidates.add(value);
  }

  if (url.search.length > 1) {
    candidates.add(url.search.slice(1));
    try {
      candidates.add(decodeURIComponent(url.search.slice(1)));
    } catch {
      // Ignore malformed encoded segments.
    }
  }

  for (const candidate of candidates) {
    const embeddedUrls = extractHttpUrls(candidate);
    for (const embedded of embeddedUrls) {
      const normalized = normalizeCandidateUrl(embedded);
      if (normalized && hasSupported3dExtension(normalized)) {
        return normalized;
      }
    }
  }

  return null;
}

async function resolveZenodoRecordFileUrl(
  url: URL,
  fetchFn: typeof fetch,
): Promise<string | null> {
  const match = url.pathname.match(/^\/records\/(\d+)(?:\/)?$/);
  if (!match) {
    return null;
  }

  const recordId = match[1];
  const apiUrl = `https://zenodo.org/api/records/${recordId}`;
  const response = await fetchFn(apiUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OCRA Asset Import/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Zenodo record lookup failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ZenodoApiRecord;
  const files = Array.isArray(payload.files) ? payload.files : [];
  for (const file of files) {
    if (!isZenodoApiFile(file)) {
      continue;
    }
    const resolved = extractZenodoFileUrl(file);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function resolveKnownRemoteMediaUrl(
  rawUrl: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase();

  if (hostname === '3drepo.eu' || hostname.endsWith('.3drepo.eu')) {
    const embedded = extractEmbeddedViewerTarget(parsed);
    if (embedded) {
      return resolveKnownRemoteMediaUrl(embedded, fetchFn);
    }
    return parsed.toString();
  }

  if (hostname === 'zenodo.org') {
    const fromRecord = await resolveZenodoRecordFileUrl(parsed, fetchFn);
    if (fromRecord) {
      return fromRecord;
    }
  }

  return parsed.toString();
}

/**
 * Resolves provider-specific viewer or record URLs to a direct downloadable media URL when possible.
 */
export async function resolveRemoteMediaSourceUrl(
  rawUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  return resolveKnownRemoteMediaUrl(rawUrl, fetchFn);
}
