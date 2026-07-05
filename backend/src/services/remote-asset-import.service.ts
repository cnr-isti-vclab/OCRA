import dns from 'dns/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import fsp from 'fs/promises';
import { Readable } from 'stream';
import { ensureProjectSkeleton, projectTmpDir } from '../utils/project-static-paths.js';
import type { PreparedAssetFile } from './asset-ingestion.service.js';
import { resolveRemoteMediaSourceUrl } from './remote-media-source-resolver.service.js';

const MAX_REMOTE_ASSET_SIZE_BYTES = 1024 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

const ZIP_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
]);

export interface RemoteAssetBasicAuth {
  username: string;
  password: string;
}

function sanitizeDownloadName(name: string) {
  const trimmed = name.trim().replace(/[/\\]+/g, '_');
  const safe = trimmed.replace(/[^a-z0-9._-]/gi, '_');
  return safe || 'remote_asset';
}

function extensionFromContentType(contentType: string | null) {
  const normalized = (contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (ZIP_CONTENT_TYPES.has(normalized)) {
    return '.zip';
  }
  if (normalized === 'model/gltf+json') {
    return '.gltf';
  }
  if (normalized === 'model/gltf-binary') {
    return '.glb';
  }
  return '';
}

function extractFileNameFromContentDisposition(header: string | null) {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  return plainMatch?.[1] || plainMatch?.[2] || null;
}

function deriveDownloadFileName(url: URL, contentDisposition: string | null, contentType: string | null) {
  const fromHeader = extractFileNameFromContentDisposition(contentDisposition);
  const fromPath = path.posix.basename(url.pathname);
  const baseName = sanitizeDownloadName(fromHeader || fromPath || 'remote_asset');
  const currentExt = path.extname(baseName);
  if (currentExt) {
    return baseName;
  }

  const derivedExt = extensionFromContentType(contentType);
  return `${baseName}${derivedExt}`;
}

function ipv4ToInt(ip: string) {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function isIpv4InRange(ip: string, start: string, end: string) {
  const value = ipv4ToInt(ip);
  const lower = ipv4ToInt(start);
  const upper = ipv4ToInt(end);
  if (value === null || lower === null || upper === null) {
    return false;
  }
  return value >= lower && value <= upper;
}

function isDisallowedIpAddress(address: string) {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb')
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('ff')
      || normalized.startsWith('2001:db8')
    );
  }

  return (
    isIpv4InRange(address, '0.0.0.0', '0.255.255.255')
    || isIpv4InRange(address, '10.0.0.0', '10.255.255.255')
    || isIpv4InRange(address, '100.64.0.0', '100.127.255.255')
    || isIpv4InRange(address, '127.0.0.0', '127.255.255.255')
    || isIpv4InRange(address, '169.254.0.0', '169.254.255.255')
    || isIpv4InRange(address, '172.16.0.0', '172.31.255.255')
    || isIpv4InRange(address, '192.0.0.0', '192.0.0.255')
    || isIpv4InRange(address, '192.168.0.0', '192.168.255.255')
    || isIpv4InRange(address, '198.18.0.0', '198.19.255.255')
    || isIpv4InRange(address, '224.0.0.0', '255.255.255.255')
  );
}

export async function validateRemoteAssetSourceUrl(rawUrl: string, lookupFn: typeof dns.lookup = dns.lookup) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('sourceUrl must be a valid absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('sourceUrl must use http or https');
  }

  if (parsed.username || parsed.password) {
    throw new Error('sourceUrl must not embed credentials');
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('sourceUrl points to a disallowed host');
  }

  const resolved = await lookupFn(hostname, { all: true, verbatim: true });
  if (!resolved.length) {
    throw new Error('sourceUrl hostname could not be resolved');
  }

  if (resolved.some((entry) => isDisallowedIpAddress(entry.address))) {
    throw new Error('sourceUrl resolves to a private or disallowed network address');
  }

  return parsed;
}

export async function downloadRemoteAssetToProjectTemp(
  projectId: string,
  sourceUrl: string,
  auth?: RemoteAssetBasicAuth | null,
): Promise<{
  file: PreparedAssetFile;
  finalUrl: string;
  bytesDownloaded: number;
}> {
  ensureProjectSkeleton(projectId);
  const tmpDir = projectTmpDir(projectId);
  await fsp.mkdir(tmpDir, { recursive: true });

  const resolvedSourceUrl = await resolveRemoteMediaSourceUrl(sourceUrl);
  let currentUrl = await validateRemoteAssetSourceUrl(resolvedSourceUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/zip,model/*,application/octet-stream;q=0.8,*/*;q=0.5',
          ...(auth
            ? {
              Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64')}`,
            }
            : {}),
          'User-Agent': 'OCRA Asset Import/1.0',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Remote server returned a redirect without a location header');
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new Error('Too many redirects while fetching remote asset');
        }

        currentUrl = await validateRemoteAssetSourceUrl(new URL(location, currentUrl).toString());
        continue;
      }

      if (!response.ok) {
        throw new Error(`Remote server responded with HTTP ${response.status}`);
      }

      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const parsedLength = Number.parseInt(contentLengthHeader, 10);
        if (Number.isFinite(parsedLength) && parsedLength > MAX_REMOTE_ASSET_SIZE_BYTES) {
          throw new Error('Remote asset is larger than the supported 1 GiB limit');
        }
      }

      if (!response.body) {
        throw new Error('Remote server returned an empty response body');
      }

      const downloadName = deriveDownloadFileName(
        currentUrl,
        response.headers.get('content-disposition'),
        response.headers.get('content-type'),
      );
      const uniqueName = `${Date.now()}_${randomUUID()}_${downloadName}`;
      const destinationPath = path.join(tmpDir, uniqueName);
      const writable = createWriteStream(destinationPath, { flags: 'wx' });

      let bytesDownloaded = 0;

      try {
        for await (const chunk of Readable.fromWeb(response.body as never)) {
          const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesDownloaded += bufferChunk.length;

          if (bytesDownloaded > MAX_REMOTE_ASSET_SIZE_BYTES) {
            throw new Error('Remote asset exceeded the supported 1 GiB limit during download');
          }

          if (!writable.write(bufferChunk)) {
            await new Promise<void>((resolve, reject) => {
              writable.once('drain', resolve);
              writable.once('error', reject);
            });
          }
        }

        await new Promise<void>((resolve, reject) => {
          writable.once('finish', resolve);
          writable.once('error', reject);
          writable.end();
        });
      } catch (error) {
        writable.destroy();
        await fsp.rm(destinationPath, { force: true });
        throw error;
      }

      return {
        file: {
          path: destinationPath,
          originalname: downloadName,
          mimetype: response.headers.get('content-type')?.split(';', 1)[0].trim() || 'application/octet-stream',
        },
        finalUrl: currentUrl.toString(),
        bytesDownloaded,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Remote asset download timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Unexpected redirect handling failure');
}
