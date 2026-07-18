import { LOCALES, PRIMARY_LOCALE } from '../constants';

type HtmlHead = {
  canonicalUrls: string[];
  descriptions: string[];
  hrefLangs: string[];
  ogUrls: string[];
  title: string | null;
};

type SeoFailure = {
  label: string;
  message: string;
  url: string;
};

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 25_000;
const REQUIRED_HREFLANGS = [...LOCALES, 'x-default'];
const PLACEHOLDER_DESCRIPTION_PATTERNS = [/\bWIP\b/i];

function getBaseUrl() {
  const baseUrl =
    process.argv[2] ?? process.env.VITE_ROOT_URL ?? DEFAULT_BASE_URL;
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function getTimeoutMs() {
  const timeoutMs = Number.parseInt(
    process.env.SEO_CHECK_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`,
    10,
  );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('SEO_CHECK_TIMEOUT_MS must be a positive integer.');
  }
  return timeoutMs;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function extractSitemapLocs(xml: string) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) =>
    decodeEntities(match[1]?.trim() ?? ''),
  );
}

function extractAttribute(tag: string, attributeName: string) {
  const pattern = new RegExp(
    `${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i',
  );
  const match = tag.match(pattern);
  return decodeEntities(match?.[1] ?? match?.[2] ?? '');
}

function getHeadTag(html: string) {
  return html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
}

function parseHtmlHead(html: string): HtmlHead {
  const head = getHeadTag(html);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const canonicalUrls: string[] = [];
  const descriptions: string[] = [];
  const hrefLangs: string[] = [];
  const ogUrls: string[] = [];

  for (const match of head.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const tag = match[0];
    if (tag.startsWith('<link')) {
      const rel = extractAttribute(tag, 'rel').toLowerCase();
      if (rel === 'canonical') {
        canonicalUrls.push(extractAttribute(tag, 'href'));
      }
      if (rel === 'alternate') {
        const hrefLang = extractAttribute(tag, 'hreflang');
        if (hrefLang !== '') {
          hrefLangs.push(hrefLang);
        }
      }
      continue;
    }

    const name = extractAttribute(tag, 'name').toLowerCase();
    const property = extractAttribute(tag, 'property').toLowerCase();
    if (name === 'description') {
      descriptions.push(extractAttribute(tag, 'content'));
    }
    if (property === 'og:url') {
      ogUrls.push(extractAttribute(tag, 'content'));
    }
  }

  return {
    canonicalUrls,
    descriptions,
    hrefLangs,
    ogUrls,
    title: title == null || title === '' ? null : decodeEntities(title),
  };
}

function getPathname(url: string) {
  return new URL(url).pathname;
}

function getRepresentativeUrls(baseUrl: string, sitemapLocs: string[]) {
  const requiredPaths = [
    '/',
    '/zh-Hans',
    '/about',
    '/statistics',
    '/system-map',
    '/history/2026',
    '/history/2026/06',
  ];
  const sitemapPaths = sitemapLocs.map((loc) => ({
    loc,
    pathname: getPathname(loc),
  }));
  const dynamicPrefixes = ['/lines/', '/stations/', '/operators/', '/issues/'];
  const representativeUrls = requiredPaths.map((path) =>
    new URL(path, baseUrl).toString(),
  );
  const missingDynamicPrefixes: string[] = [];

  for (const prefix of dynamicPrefixes) {
    const match = sitemapPaths.find(({ pathname }) =>
      pathname.startsWith(prefix),
    );
    if (match == null) {
      missingDynamicPrefixes.push(prefix);
      continue;
    }
    representativeUrls.push(match.loc);
  }

  return { missingDynamicPrefixes, representativeUrls };
}

function validateHead(url: string, head: HtmlHead): SeoFailure[] {
  const failures: SeoFailure[] = [];

  if (head.title == null) {
    failures.push({ label: 'head', url, message: 'missing <title>' });
  }

  if (head.descriptions.length !== 1) {
    failures.push({
      label: 'head',
      url,
      message: `expected one meta description, found ${head.descriptions.length}`,
    });
  }

  for (const description of head.descriptions) {
    if (description.trim() === '') {
      failures.push({
        label: 'head',
        url,
        message: 'meta description is empty',
      });
    }
    for (const pattern of PLACEHOLDER_DESCRIPTION_PATTERNS) {
      if (pattern.test(description)) {
        failures.push({
          label: 'head',
          url,
          message: `meta description contains placeholder text: ${description}`,
        });
      }
    }
  }

  if (head.canonicalUrls.length !== 1) {
    failures.push({
      label: 'head',
      url,
      message: `expected one canonical link, found ${head.canonicalUrls.length}`,
    });
  }

  if (head.ogUrls.length !== 1) {
    failures.push({
      label: 'head',
      url,
      message: `expected one og:url, found ${head.ogUrls.length}`,
    });
  }

  if (
    head.canonicalUrls.length === 1 &&
    head.ogUrls.length === 1 &&
    head.canonicalUrls[0] !== head.ogUrls[0]
  ) {
    failures.push({
      label: 'head',
      url,
      message: `canonical URL does not match og:url: ${head.canonicalUrls[0]} != ${head.ogUrls[0]}`,
    });
  }

  for (const hrefLang of REQUIRED_HREFLANGS) {
    if (!head.hrefLangs.includes(hrefLang)) {
      failures.push({
        label: 'head',
        url,
        message: `missing hreflang alternate: ${hrefLang}`,
      });
    }
  }

  return failures;
}

async function checkSitemap(baseUrl: string, timeoutMs: number) {
  const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
  const response = await fetchWithTimeout(
    sitemapUrl,
    {
      headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
      redirect: 'manual',
    },
    timeoutMs,
  );

  if (response.status !== 200) {
    throw new Error(`Sitemap returned ${response.status}: ${sitemapUrl}`);
  }

  const locs = extractSitemapLocs(await response.text());
  if (locs.length === 0) {
    throw new Error(`Sitemap contains no <loc> entries: ${sitemapUrl}`);
  }

  return locs;
}

async function checkSitemapUrls(locs: string[], timeoutMs: number) {
  const failures: SeoFailure[] = [];

  for (const loc of locs) {
    try {
      const response = await fetchWithTimeout(
        loc,
        {
          headers: { accept: 'text/html,*/*;q=0.1' },
          redirect: 'manual',
        },
        timeoutMs,
      );
      if (response.status !== 200) {
        failures.push({
          label: 'sitemap',
          url: loc,
          message: `expected 200 without redirect, got ${response.status}`,
        });
      }
    } catch (error) {
      failures.push({
        label: 'sitemap',
        url: loc,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return failures;
}

async function checkPrimaryLocaleRedirects(baseUrl: string, timeoutMs: number) {
  const failures: SeoFailure[] = [];
  const redirects = [
    { from: `/${PRIMARY_LOCALE}`, to: '/' },
    { from: `/${PRIMARY_LOCALE}/about`, to: '/about' },
  ];

  for (const { from, to } of redirects) {
    const url = new URL(from, baseUrl).toString();
    try {
      const response = await fetchWithTimeout(
        url,
        { redirect: 'manual' },
        timeoutMs,
      );
      if (response.status !== 308) {
        failures.push({
          label: 'locale redirect',
          url,
          message: `expected 308, got ${response.status}`,
        });
        continue;
      }

      const location = response.headers.get('location');
      const expectedLocation = new URL(to, baseUrl).toString();
      if (
        location == null ||
        new URL(location, url).toString() !== expectedLocation
      ) {
        failures.push({
          label: 'locale redirect',
          url,
          message: `expected Location ${expectedLocation}, got ${location ?? 'none'}`,
        });
      }
    } catch (error) {
      failures.push({
        label: 'locale redirect',
        url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return failures;
}

async function checkRepresentativePages(
  urls: string[],
  timeoutMs: number,
): Promise<SeoFailure[]> {
  const failures: SeoFailure[] = [];

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: { accept: 'text/html' },
          redirect: 'manual',
        },
        timeoutMs,
      );
      if (response.status !== 200) {
        failures.push({
          label: 'head',
          url,
          message: `expected 200 without redirect, got ${response.status}`,
        });
        continue;
      }

      failures.push(...validateHead(url, parseHtmlHead(await response.text())));
    } catch (error) {
      failures.push({
        label: 'head',
        url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return failures;
}

async function main() {
  const baseUrl = getBaseUrl();
  const timeoutMs = getTimeoutMs();
  const sitemapLocs = await checkSitemap(baseUrl, timeoutMs);
  const { missingDynamicPrefixes, representativeUrls } = getRepresentativeUrls(
    baseUrl,
    sitemapLocs,
  );
  const failures: SeoFailure[] = [
    ...(await checkPrimaryLocaleRedirects(baseUrl, timeoutMs)),
    ...(await checkSitemapUrls(sitemapLocs, timeoutMs)),
    ...(await checkRepresentativePages(representativeUrls, timeoutMs)),
    ...missingDynamicPrefixes.map((prefix) => ({
      label: 'representative',
      url: new URL(prefix, baseUrl).toString(),
      message: `sitemap has no URL matching ${prefix}`,
    })),
  ];

  if (failures.length > 0) {
    console.table(failures);
    process.exitCode = 1;
    return;
  }

  console.log(
    `SEO check passed: ${sitemapLocs.length} sitemap URLs and ${representativeUrls.length} representative pages checked.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
