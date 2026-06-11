import { describe, expect, it } from 'vitest';
import { getLlmsTxt } from './llmsTxt';

describe('getLlmsTxt', () => {
  it('renders a curated agent entry point with absolute public resource links', () => {
    expect(getLlmsTxt({ rootUrl: 'https://example.com/base/' })).toContain(
      '[Current public status page](https://example.com/)',
    );
    expect(getLlmsTxt({ rootUrl: 'https://example.com/base/' })).toContain(
      '[Sitemap](https://example.com/sitemap.xml)',
    );
    expect(getLlmsTxt({ rootUrl: 'https://example.com/base/' })).toContain(
      '[llms.txt](https://example.com/llms.txt)',
    );
  });

  it('advertises canonical Markdown routes and entity route patterns', () => {
    const markdown = getLlmsTxt();

    expect(markdown).toContain('# mrtdown');
    expect(markdown).toContain('## Available Markdown');
    expect(markdown).toContain('/index.md');
    expect(markdown).toContain('/lines/%7BlineId%7D/index.md');
    expect(markdown).toContain('/stations/%7BstationId%7D/index.md');
    expect(markdown).toContain('/operators/%7BoperatorId%7D/index.md');
    expect(markdown).toContain('/issues/%7BissueId%7D/index.md');
  });
});
