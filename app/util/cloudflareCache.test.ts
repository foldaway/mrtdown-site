import { describe, expect, it, vi } from 'vitest';
import { purgePublicDataCache } from './cloudflareCache';

describe('Cloudflare public data cache purge', () => {
  it('purges the environment-scoped cache tag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { id: 'purge' } }), {
        status: 200,
      }),
    );

    await expect(
      purgePublicDataCache({
        env: {
          CLOUDFLARE_CACHE_PURGE_TOKEN: 'secret-token',
          CLOUDFLARE_ZONE_ID: 'zone-id',
          TIER: 'staging',
        },
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: 'purged',
      tag: 'mrtdown-staging-data',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-id/purge_cache',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tags: ['mrtdown-staging-data'] }),
      }),
    );
  });

  it('skips local environments without Cloudflare credentials', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(purgePublicDataCache({ env: {} })).resolves.toEqual({
      status: 'skipped',
      reason: 'not-configured',
    });

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('requires purge credentials in deployed environments', async () => {
    await expect(
      purgePublicDataCache({ env: { TIER: 'production' } }),
    ).rejects.toThrow(
      'CLOUDFLARE_ZONE_ID and CLOUDFLARE_CACHE_PURGE_TOKEN are required',
    );
  });

  it('fails when Cloudflare rejects the purge', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('invalid token', {
        status: 403,
      }),
    );

    await expect(
      purgePublicDataCache({
        env: {
          CLOUDFLARE_CACHE_PURGE_TOKEN: 'bad-token',
          CLOUDFLARE_ZONE_ID: 'zone-id',
          TIER: 'production',
        },
        fetchImpl,
      }),
    ).rejects.toThrow('Cloudflare cache purge failed with 403');
  });
});
