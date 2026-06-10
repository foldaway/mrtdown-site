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
  });

  it('documents the canonical Markdown route patterns', () => {
    const markdown = getLlmsTxt();

    expect(markdown).toContain('# mrtdown');
    expect(markdown).toContain('| Current system status | /index.md');
    expect(markdown).toContain(
      '| Line profile          | /lines/{lineId}/index.md',
    );
    expect(markdown).toContain(
      '| Station profile       | /stations/{stationId}/index.md',
    );
    expect(markdown).toContain(
      '| Operator profile      | /operators/{operatorId}/index.md',
    );
    expect(markdown).toContain(
      '| Issue profile         | /issues/{issueId}/index.md',
    );
  });
});
