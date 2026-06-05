import { describe, expect, it, vi } from 'vitest';
import { validateRemoteAssetSourceUrl } from '../services/remote-asset-import.service.js';

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
