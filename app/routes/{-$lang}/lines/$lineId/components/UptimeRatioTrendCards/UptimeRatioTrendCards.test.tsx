import { renderToString } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import type { TimeScaleChart } from '~/types';
import {
  buildOperatorUptimeGraph,
  buildUptimeGraph,
} from '~/util/dbQueries/lineAnalytics';
import { TEST_LINE } from '~/util/dbQueries/testFixtures';
import { UptimeRatioTrendCards } from './index';

const renderGraph = (graph: TimeScaleChart) =>
  renderToString(
    <IntlProvider locale="en-SG">
      <UptimeRatioTrendCards graphs={[graph]} />
    </IntlProvider>,
  );

describe('UptimeRatioTrendCards', () => {
  it('renders unknown line and operator uptime without a percentage or comparison', () => {
    const line = { ...TEST_LINE, operatingHours: undefined };
    for (const graph of [
      buildUptimeGraph(line, [], new Set(), 7),
      buildOperatorUptimeGraph([line], {}, new Set(), 7),
    ]) {
      const html = renderGraph(graph);
      expect(html).toContain('Unknown');
      expect(html).not.toContain('vs previous');
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('100%');
    }
  });

  it('preserves known uptime and previous-period comparisons', () => {
    const html = renderGraph({
      title: '7d',
      data: [],
      dataTimeScale: { granularity: 'day', count: 7 },
      dataCumulative: [
        { name: 'current', payload: { uptimeRatio: 0.95 } },
        { name: 'previous', payload: { uptimeRatio: 0.9 } },
      ],
    });
    expect(html).toContain('95%');
    expect(html).toContain('+5%');
    expect(html).toContain('vs previous');
  });
});
