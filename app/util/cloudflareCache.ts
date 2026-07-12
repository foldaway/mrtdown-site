import { getPublicDataCacheTag } from './publicResponseCache';

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const CACHE_PURGE_TIMEOUT_MS = 10_000;
const DEPLOYED_TIERS = new Set(['preview', 'production', 'staging']);

type CloudflareCachePurgeEnv = {
  CLOUDFLARE_CACHE_PURGE_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  TIER?: string;
};

type PurgePublicDataCacheOptions = {
  env?: CloudflareCachePurgeEnv;
  fetchImpl?: typeof fetch;
};

export type PurgePublicDataCacheResult =
  | { status: 'purged'; tag: string }
  | { status: 'skipped'; reason: 'not-configured' };

export async function purgePublicDataCache(
  options: PurgePublicDataCacheOptions = {},
): Promise<PurgePublicDataCacheResult> {
  const env = options.env ?? process.env;
  const token = env.CLOUDFLARE_CACHE_PURGE_TOKEN;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (token == null || token === '' || zoneId == null || zoneId === '') {
    if (env.TIER != null && DEPLOYED_TIERS.has(env.TIER.toLowerCase())) {
      throw new Error(
        'CLOUDFLARE_ZONE_ID and CLOUDFLARE_CACHE_PURGE_TOKEN are required in deployed environments',
      );
    }
    console.warn(
      '[CACHE] Cloudflare purge skipped because CLOUDFLARE_ZONE_ID or CLOUDFLARE_CACHE_PURGE_TOKEN is not configured',
    );
    return { status: 'skipped', reason: 'not-configured' };
  }

  const tag = getPublicDataCacheTag(env.TIER);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CACHE_PURGE_TIMEOUT_MS);

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${CLOUDFLARE_API_BASE_URL}/zones/${encodeURIComponent(zoneId)}/purge_cache`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tags: [tag] }),
        signal: controller.signal,
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Cloudflare cache purge failed with ${response.status}: ${responseText.slice(0, 500)}`,
      );
    }

    let result: { success?: boolean } | undefined;
    try {
      result = JSON.parse(responseText) as { success?: boolean };
    } catch {
      throw new Error('Cloudflare cache purge returned invalid JSON');
    }
    if (result.success !== true) {
      throw new Error(
        `Cloudflare cache purge was not successful: ${responseText.slice(0, 500)}`,
      );
    }

    console.log('[CACHE] Purged Cloudflare public data cache', { tag });
    return { status: 'purged', tag };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Cloudflare cache purge timed out after ${CACHE_PURGE_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
