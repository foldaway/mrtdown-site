import { renderToString } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import type { TimeScaleChart } from '~/types';
import { CountTrendCards } from './index';

const messages = {
  'general.issues_past_period': 'Issue Count (past {period})',
  'general.disruption_count':
    '{count, plural, one {{count} disruption} other {{count} disruptions}}',
  'general.change_since_previous': '{change} vs previous',
};

describe('Line CountTrendCards', () => {
  it('renders cumulative disruption counts from the graph payload', () => {
    const graph: TimeScaleChart = {
      title: '7d',
      dataTimeScale: {
        granularity: 'day',
        count: 7,
      },
      data: [
        {
          name: '2026-06-01',
          payload: {
            disruption: 5,
            maintenance: 1,
            infra: 0,
          },
        },
      ],
      dataCumulative: [
        {
          name: 'current',
          payload: {
            disruption: 5,
            maintenance: 1,
            infra: 0,
          },
        },
        {
          name: 'previous',
          payload: {
            disruption: 2,
            maintenance: 0,
            infra: 0,
          },
        },
      ],
    };

    const html = renderToString(
      <IntlProvider locale="en-SG" messages={messages}>
        <CountTrendCards graphs={[graph]} />
      </IntlProvider>,
    );

    expect(html).toContain('5 disruptions');
    expect(html).toContain('+3');
    expect(html).toContain('vs previous');
  });
});
