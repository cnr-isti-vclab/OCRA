import { describe, expect, it, vi } from 'vitest';
import { validateRemoteAssetSourceUrl } from '../services/remote-asset-import.service.js';
import { resolveRemoteMediaSourceUrl } from '../services/remote-media-source-resolver.service.js';

describe('remote asset import URL validation', () => {
  it('accepts public http and https URLs', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const parsed = await validateRemoteAssetSourceUrl('https://example.org/assets/model.zip', lookup as never);

    expect(parsed.toString()).toBe('https://example.org/assets/model.zip');
    expect(lookup).toHaveBeenCalledWith('example.org', { all: true, verbatim: true });
  });

  it('rejects localhost URLs', async () => {
    await expect(validateRemoteAssetSourceUrl('http://localhost:8080/file.zip')).rejects.toThrow(
      'sourceUrl points to a disallowed host',
    );
  });

  it('rejects private network resolutions', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '10.0.0.4', family: 4 }]);

    await expect(
      validateRemoteAssetSourceUrl('https://internal.example.org/file.zip', lookup as never),
    ).rejects.toThrow('sourceUrl resolves to a private or disallowed network address');
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(
      validateRemoteAssetSourceUrl('https://user:secret@example.org/file.zip'),
    ).rejects.toThrow('sourceUrl must not embed credentials');
  });

  it('keeps separate basic auth support compatible with clean source URLs', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const parsed = await validateRemoteAssetSourceUrl('https://example.org/protected/file.zip', lookup as never);

    expect(parsed.username).toBe('');
    expect(parsed.password).toBe('');
  });
});

describe('remote media source resolver', () => {
  it('extracts an embedded Zenodo direct file URL from a 3drepo viewer URL', async () => {
    const resolved = await resolveRemoteMediaSourceUrl(
      'https://3drepo.eu/modelviewer.html?https%3A%2F%2Fzenodo.org%2Fapi%2Frecords%2F11252294%2Ffiles%2FLange_Houtstraat_28.glb%2Fcontent'
    );

    expect(resolved).toBe(
      'https://zenodo.org/api/records/11252294/files/Lange_Houtstraat_28.glb/content'
    );
  });

  it('resolves a Zenodo record page to its downloadable 3D file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [
          {
            key: 'Lange_Houtstraat_17.glb',
            links: {
              content: 'https://zenodo.org/api/records/11481513/files/Lange_Houtstraat_17.glb/content',
            },
          },
        ],
      }),
    });

    const resolved = await resolveRemoteMediaSourceUrl(
      'https://zenodo.org/records/11481513',
      fetchMock as never,
    );

    expect(fetchMock).toHaveBeenCalledWith('https://zenodo.org/api/records/11481513', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OCRA Asset Import/1.0',
      },
    });
    expect(resolved).toBe(
      'https://zenodo.org/api/records/11481513/files/Lange_Houtstraat_17.glb/content'
    );
  });
});
