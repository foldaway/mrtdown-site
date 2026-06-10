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

  it('only advertises Markdown routes that exist in this phase', () => {
    const markdown = getLlmsTxt();

    expect(markdown).toContain('# mrtdown');
    expect(markdown).toContain('## Available Markdown');
    expect(markdown).toContain(
      'Additional entity Markdown routes will be linked here after those routes are implemented.',
    );
    expect(markdown).not.toContain('/index.md');
    expect(markdown).not.toContain('/lines/{lineId}/index.md');
    expect(markdown).not.toContain('/stations/{stationId}/index.md');
    expect(markdown).not.toContain('/operators/{operatorId}/index.md');
    expect(markdown).not.toContain('/issues/{issueId}/index.md');
  });
});
