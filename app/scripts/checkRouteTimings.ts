type ProbeGroup = 'html' | 'markdown' | 'xml';

type RouteProbe = {
  group: ProbeGroup;
  label: string;
  route: string;
  accept: string;
  expectedStatuses?: readonly number[];
};

const HTML_PROBES = [
  '/',
  '/?viewport=md',
  '/?viewport=lg',
  '/statistics',
  '/history',
  '/about',
  '/lines/BPLRT',
  '/stations/BKP',
  '/operators/SMRT_TRAINS',
].map(
  (route) =>
    ({
      group: 'html',
      label: route,
      route,
      accept: 'text/html',
    }) satisfies RouteProbe,
);

const MARKDOWN_PROBES = [
  {
    label: 'llms.txt',
    route: '/llms.txt',
    accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1',
  },
  {
    label: 'overview index.md',
    route: '/index.md',
    accept: 'text/markdown',
  },
  {
    label: 'line index.md',
    route: '/lines/BPLRT/index.md',
    accept: 'text/markdown',
  },
  {
    label: 'station index.md',
    route: '/stations/BKP/index.md',
    accept: 'text/markdown',
  },
  {
    label: 'operator index.md',
    route: '/operators/SMRT_TRAINS/index.md',
    accept: 'text/markdown',
  },
  {
    label: 'line .md alias attempt',
    route: '/lines/BPLRT.md',
    accept: 'text/markdown',
    expectedStatuses: [404],
  },
  {
    label: 'station .md alias attempt',
    route: '/stations/BKP.md',
    accept: 'text/markdown',
    expectedStatuses: [404],
  },
  {
    label: 'HTML route with Markdown Accept',
    route: '/lines/BPLRT',
    accept: 'text/markdown',
    expectedStatuses: [406],
  },
].map(
  (probe) =>
    ({
      group: 'markdown',
      ...probe,
    }) satisfies RouteProbe,
);

const XML_PROBES = [
  {
    group: 'xml',
    label: 'sitemap.xml',
    route: '/sitemap.xml',
    accept: 'application/xml, text/xml;q=0.9, */*;q=0.1',
  },
] satisfies RouteProbe[];

const DEFAULT_PROBES = [...HTML_PROBES, ...MARKDOWN_PROBES, ...XML_PROBES];

type ProbeTiming = {
  group: ProbeGroup;
  label: string;
  route: string;
  expectedStatuses: readonly number[];
  status: number;
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  contentType: string;
  cacheControl: string;
  cfCacheStatus: string;
  appCache: string;
  serverTiming: string;
  render: string;
};

type TimingResult = ProbeTiming & {
  sample: number;
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

function getProbeGroups() {
  const raw = process.env.PROBES ?? 'all';
  const groups = raw
    .split(',')
    .map((group) => group.trim())
    .filter((group) => group !== '');

  if (groups.includes('all')) {
    return new Set<ProbeGroup>(['html', 'markdown', 'xml']);
  }

  const selectedGroups = new Set<ProbeGroup>();
  for (const group of groups) {
    if (group !== 'html' && group !== 'markdown' && group !== 'xml') {
      throw new Error(
        'PROBES must be "all", "html", "markdown", "xml", or a comma list.',
      );
    }
    selectedGroups.add(group);
  }

  if (selectedGroups.size === 0) {
    throw new Error('PROBES must select at least one probe group.');
  }

  return selectedGroups;
}

function getSelectedProbes() {
  const groups = getProbeGroups();
  return DEFAULT_PROBES.filter((probe) => groups.has(probe.group));
}

async function timeRoute(
  baseUrl: string,
  probe: RouteProbe,
): Promise<ProbeTiming> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${probe.route}`, {
    headers: {
      accept: probe.accept,
      'accept-encoding': 'br, gzip, deflate',
    },
    redirect: 'follow',
  });
  const ttfbMs = performance.now() - startedAt;
  const bytes = (await response.arrayBuffer()).byteLength;
  const totalMs = performance.now() - startedAt;

  return {
    group: probe.group,
    label: probe.label,
    route: probe.route,
    expectedStatuses: probe.expectedStatuses ?? [200],
    status: response.status,
    ttfbMs: Number(ttfbMs.toFixed(1)),
    totalMs: Number(totalMs.toFixed(1)),
    bytes,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('cache-control') ?? '',
    cfCacheStatus: response.headers.get('cf-cache-status') ?? '',
    appCache: response.headers.get('x-mrtdown-cache') ?? '',
    serverTiming: response.headers.get('server-timing') ?? '',
    render: response.headers.get('x-mrtdown-render') ?? '',
  };
}

function getRouteCheckFailures(results: TimingResult[]) {
  const failures: string[] = [];

  for (const result of results) {
    if (!result.expectedStatuses.includes(result.status)) {
      failures.push(
        `${result.label} sample ${result.sample} returned ${result.status}; expected ${result.expectedStatuses.join(
          ' or ',
        )}`,
      );
      continue;
    }

    if (result.status >= 200 && result.status < 300 && result.bytes === 0) {
      failures.push(`${result.label} sample ${result.sample} returned 0 bytes`);
    }
  }

  return failures;
}

async function main() {
  const baseUrl = getBaseUrl();
  const probes = getSelectedProbes();
  const sampleCountRaw = Number.parseInt(process.env.SAMPLES ?? '3', 10);
  if (!Number.isFinite(sampleCountRaw) || sampleCountRaw <= 0) {
    throw new Error('SAMPLES must be a positive integer.');
  }
  const sampleCount = sampleCountRaw;
  const results: TimingResult[] = [];

  for (let sample = 0; sample < sampleCount; sample++) {
    for (const probe of probes) {
      results.push({
        ...(await timeRoute(baseUrl, probe)),
        sample: sample + 1,
      });
    }
  }

  console.table(
    results.map((result) => ({
      sample: result.sample,
      group: result.group,
      label: result.label,
      route: result.route,
      expected: result.expectedStatuses.join('/'),
      status: result.status,
      ttfbMs: result.ttfbMs,
      totalMs: result.totalMs,
      bytes: result.bytes,
      contentType: result.contentType,
      cfCache: result.cfCacheStatus,
      appCache: result.appCache,
      render: result.render,
      cacheControl: result.cacheControl,
      serverTiming: result.serverTiming,
    })),
  );

  const failures = getRouteCheckFailures(results);
  if (failures.length > 0) {
    console.error(
      [
        'Route smoke checks failed:',
        ...failures.map((failure) => `- ${failure}`),
      ].join('\n'),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
