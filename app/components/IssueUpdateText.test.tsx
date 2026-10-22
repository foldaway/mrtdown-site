import { nonPublicEvidenceRedactedText } from '@mrtdown/fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import enMessages from '../../lang/en-SG.json';
import msMessages from '../../lang/ms.json';
import taMessages from '../../lang/ta.json';
import zhMessages from '../../lang/zh-Hans.json';
import { TimelineItem } from '~/routes/{-$lang}/issues/$issueId/components/TimelineCard/components/TimelineItem';
import { toIssueUpdate } from '~/util/dbQueries/issueEvidence';

const EVIDENCE = {
  type: 'report.public' as const,
  text: nonPublicEvidenceRedactedText,
  render: null,
  source_url: 'https://example.com/original',
  ts: '2026-10-22T06:00:00Z',
};

describe('issue update text', () => {
  it.each([
    { locale: 'en-SG', messages: enMessages },
    { locale: 'zh-Hans', messages: zhMessages },
    { locale: 'ms', messages: msMessages },
    { locale: 'ta', messages: taMessages },
  ])(
    'renders a localized notice and source link in $locale',
    ({ locale, messages }) => {
      const html = renderToStaticMarkup(
        <IntlProvider locale={locale} messages={messages}>
          <TimelineItem update={toIssueUpdate(EVIDENCE)} />
        </IntlProvider>,
      );
      expect(html).toContain(messages['issue.update_text_unavailable']);
      expect(html).toContain(messages['issue.view_original_source']);
      expect(html).toContain('href="https://example.com/original"');
      expect(html).not.toContain(nonPublicEvidenceRedactedText);
    },
  );

  it('clears stale translations when the original text was redacted', () => {
    const update = toIssueUpdate({
      ...EVIDENCE,
      render: {
        source: 'original',
        text: { 'en-SG': 'Old text', 'zh-Hans': null, ms: null, ta: null },
      },
    });
    expect(update).toMatchObject({
      text: '',
      textTranslations: null,
      isTextRedacted: true,
    });
  });

  it('keeps ordinary update text intact', () => {
    const update = toIssueUpdate({ ...EVIDENCE, text: 'Service has resumed.' });
    expect(update).toMatchObject({
      text: 'Service has resumed.',
      isTextRedacted: false,
    });
  });
});
