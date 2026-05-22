const DEFAULT_ROUTES = [
  '/',
  '/?viewport=md',
  '/?viewport=lg',
  '/statistics',
  '/about',
] as const;

type TimingResult = {
  route: string;
  status: number;
  ttfbMs: number;
  bytes: number;
  cacheControl: string;
  cfCacheStatus: string;
  serverTiming: string;
  render: string;
};

function getBaseUrl() {
  const baseUrl = process.argv[2] ?? process.env.VITE_ROOT_URL;
  if (baseUrl == null || baseUrl === '') {
    throw new Error(
      'Pass a base URL as the first argument, or set VITE_ROOT_URL.',
    );
  }
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function timeRoute(
  baseUrl: string,
  route: string,
): Promise<TimingResult> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${route}`, {
    headers: {
      accept: 'text/html',
      'accept-encoding': 'br, gzip, deflate',
    },
    redirect: 'follow',
  });
  const ttfbMs = performance.now() - startedAt;
  const bytes = (await response.arrayBuffer()).byteLength;

  return {
    route,
    status: response.status,
    ttfbMs: Number(ttfbMs.toFixed(1)),
    bytes,
    cacheControl: response.headers.get('cache-control') ?? '',
    cfCacheStatus: response.headers.get('cf-cache-status') ?? '',
    serverTiming: response.headers.get('server-timing') ?? '',
    render: response.headers.get('x-mrtdown-render') ?? '',
  };
}

async function main() {
  const baseUrl = getBaseUrl();
  const sampleCountRaw = Number.parseInt(process.env.SAMPLES ?? '3', 10);
  if (!Number.isFinite(sampleCountRaw) || sampleCountRaw <= 0) {
    throw new Error('SAMPLES must be a positive integer.');
  }
  const sampleCount = sampleCountRaw;
  const results: TimingResult[] = [];

  for (let sample = 0; sample < sampleCount; sample++) {
    for (const route of DEFAULT_ROUTES) {
      results.push(await timeRoute(baseUrl, route));
    }
  }

  console.table(
    results.map((result) => ({
      route: result.route,
      status: result.status,
      ttfbMs: result.ttfbMs,
      bytes: result.bytes,
      cache: result.cfCacheStatus,
      render: result.render,
      cacheControl: result.cacheControl,
      serverTiming: result.serverTiming,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
