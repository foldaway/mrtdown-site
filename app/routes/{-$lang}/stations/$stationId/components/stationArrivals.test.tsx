import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScheduledStationArrivalLines } from '~/util/scheduledStationArrivals';
import {
  departure,
  display,
  result,
} from '~/util/scheduledStationArrivals.fixture';
import {
  type StationArrivalsV2,
  serializeStationArrivalsV2,
} from '~/util/stationArrivalsV2';
import { ServiceArrivalSummary } from './PlatformArrivalSummary';
import { StationGuide } from './StationGuide';
import {
  type ArrivalStates,
  arrivalBranchKey,
  createArrivalRefresh,
} from './stationArrivalRefresh';
import type { ArrivalLine } from './stationGuide.types';
import { TimetableSources } from './TimetableSources';

type MockLinkProps = {
  children: React.ReactNode;
  params?: { stationId?: string };
};
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: MockLinkProps) => (
    <span data-station-id={params?.stationId}>{children}</span>
  ),
}));
const scheduled = serializeStationArrivalsV2({
  source: 'scheduled',
  reason: 'complete',
  scheduled: buildScheduledStationArrivalLines(
    {
      ...result,
      complete: true,
      departures: [
        departure,
        {
          ...departure,
          departureInstant: '2026-10-24T16:15:00Z',
          precision: 'approximate',
          timepoint: 0,
          stopSequence: '002',
        },
        {
          ...departure,
          departureInstant: '2026-10-24T16:20:00Z',
          stopSequence: '003',
        },
        {
          ...departure,
          departureInstant: '2026-10-24T16:12:00Z',
          platformIds: ['c'],
          stopSequence: '004',
        },
      ],
    },
    display,
  ),
});
const timing: ArrivalLine['arrivalTimings'][number] = {
  ...display,
  ...scheduled.scope,
  platformLabels: ['A', 'B'],
};
const recentCrowdArrival = {
  reportedAt: '2026-10-24T16:08:00Z',
  expectedAt: '2026-10-24T16:11:00Z',
  expiresAt: '2026-10-24T16:12:00Z',
};
const lines = [{ lineId: timing.lineId, arrivalTimings: [timing, timing] }];
const key = arrivalBranchKey(
  timing.lineId,
  timing.serviceId,
  timing.destinationStationId,
);
function renderRow(
  data: StationArrivalsV2 | null,
  status: 'ready' | 'error' | 'loading' = 'ready',
  now: number | null = Date.parse('2026-10-24T16:08:30Z'),
  onArrivalReported?: () => Promise<void>,
) {
  return renderToStaticMarkup(
    <IntlProvider locale="en-SG" defaultLocale="en-SG">
      <ServiceArrivalSummary
        arrivalTiming={timing}
        arrivalState={{ data, status }}
        lineColor="#123456"
        now={now}
        onArrivalReported={onArrivalReported}
      />
    </IntlProvider>,
  );
}
function response(data = scheduled) {
  return Response.json({ success: true, data });
}
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('station guide arrival sources', () => {
  it('shows the next two departures per platform group as read-only times', () => {
    const html = renderRow(scheduled);
    expect(html).toMatch(/>2 <span[^>]*>min<\/span>/);
    expect(html).toMatch(
      /class="sr-only">then<\/span>.*<svg[^>]*aria-hidden="true"[^>]*>.*<strong[^>]*>.*≈.*7 min<\/strong>/,
    );
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('Scheduled times');
    expect(html).toContain('Approximate scheduled');
    expect(html).toMatch(
      />Service<\/p>.*towards <span data-station-id="[^"]+">Destination<\/span>/,
    );
    expect(html).not.toContain('D1');
    expect(html).toContain('Alternative platforms for the same train');
    expect(html).not.toContain('Dataset licence');
    expect(html).not.toContain('<ol');
    expect(html).not.toContain('<time');
    expect(html).not.toContain('Frequency estimate');
    expect(html).not.toContain('Help improve');
    expect(html).not.toContain(departure.manifestSha256);
    expect(html).not.toContain(departure.providerTripId);
  });

  it('uses clock times for stale responses and departures whose scheduled time has passed', () => {
    const stale = renderRow(scheduled, 'error');
    expect(stale).toContain('Showing the last known response');
    expect(stale).not.toMatch(/>2 <span[^>]*>min<\/span>/);
    expect(stale).not.toContain('>7 min<');
    expect(stale.match(/<time/g)).toHaveLength(3);
    expect(stale).toContain('12:10 am');
    expect(stale).not.toContain('12:20 am');
    const elapsed = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T16:10:15Z'),
    );
    expect(elapsed).not.toContain('0 min');
    expect(elapsed).toMatch(
      /class="sr-only">then<\/span>.*<strong[^>]*>.*5 min<\/strong>/,
    );
    expect(elapsed.match(/<time/g)).toHaveLength(1);
  });

  it('keeps the one-hour boundary in minutes', () => {
    const html = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T15:10:00Z'),
    );
    expect(html).toMatch(/>60 <span[^>]*>min<\/span>/);
    expect(html).not.toContain('1h 0m');
  });

  it('shows recent reports separately from the timetable and expires them on the client', () => {
    const recent = { ...scheduled, recentCrowdArrival };
    const html = renderRow(recent, 'ready', undefined, async () => {});
    expect(html).toContain('Rider-reported arrival');
    expect(html).toMatch(/>2 <span[^>]*>min<\/span>/);
    expect(html).toContain('Report an arrival');
    const expired = renderRow(
      recent,
      'ready',
      Date.parse(recent.recentCrowdArrival.expiresAt),
    );
    expect(expired).not.toContain('Rider-reported arrival');
  });

  it('offers one report action next to the timings across platform groups with the report initially collapsed', () => {
    const html = renderRow(scheduled, 'ready', undefined, async () => {});
    const triggers = [
      ...html.matchAll(
        /aria-controls="([^"]+)" aria-expanded="false" aria-label="Report an arrival"/g,
      ),
    ];
    expect(triggers).toHaveLength(1);
    expect(html).toContain('>Report</button>');
    expect(html).toContain(`hidden="" id="${triggers[0]?.[1]}"`);
    const report = html.indexOf('aria-label="Report an arrival"');
    expect(report).toBeGreaterThan(html.indexOf('class="sr-only">then</span>'));
    expect(html).not.toContain('<section');
  });

  it('keeps empty, partial, unavailable and stale responses distinct without SSR estimates', () => {
    if (scheduled.source !== 'scheduled') {
      throw new Error('fixture');
    }
    const empty = { ...scheduled, timings: [] };
    const html = renderRow(empty);
    expect(html).toContain('None in the next hour');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('Service ended');
    expect(html).not.toContain('Frequency estimate');
    const partial = {
      ...empty,
      reason: 'incomplete' as const,
      coverage: {
        ...empty.coverage,
        complete: false,
        untimedDepartureCount: 2,
      },
    };
    const unavailable = {
      ...empty,
      source: 'unavailable' as const,
      reason: 'timetable-unavailable' as const,
    };
    const onArrivalReported = async () => {};
    for (const [data, message, canReport] of [
      [empty, 'None in the next hour', false],
      [partial, 'Timetable unavailable', true],
      [unavailable, 'Timetable unavailable', true],
    ] as const) {
      const row = renderRow(data, 'ready', undefined, onArrivalReported);
      expect(row).toContain(message);
      expect(row).toContain('>—</span>');
      expect(row.includes('Report an arrival')).toBe(canReport);
      const withReport = renderRow({ ...data, recentCrowdArrival });
      expect(withReport).toContain(message);
      expect(withReport).toContain('Rider-reported arrival');
      expect(withReport).not.toContain('Frequency estimate');
    }
    const partialWithTimes = renderRow({
      ...partial,
      timings: scheduled.timings,
    });
    expect(partialWithTimes).not.toContain('Incomplete timetable');
    expect(partialWithTimes).toMatch(/>2 <span[^>]*>min<\/span>/);
    expect(partialWithTimes).not.toContain('Timetable unavailable');
    expect(renderRow(empty, 'error')).toContain(
      'Showing the last known response',
    );
    const failed = renderRow(null, 'error');
    expect(failed).toContain('Couldn’t load timetable');
    expect(failed).not.toContain('Timetable unavailable');
  });

  it.each(['ready', 'loading', 'error'] as const)(
    'does not describe expired empty results as the next hour while %s',
    (status) => {
      if (scheduled.source !== 'scheduled') throw new Error('fixture');
      const emptyGroup = {
        ...scheduled.timings[0],
        platforms: [{ id: 'empty', label: 'D' }],
        departures: [],
      };
      for (const timings of [[], [...scheduled.timings, emptyGroup]]) {
        const html = renderRow(
          { ...scheduled, timings },
          status,
          Date.parse(scheduled.window.endInstant),
        );
        expect(html).not.toContain('None in the next hour');
        expect(html).toContain('Timetable unavailable');
      }
    },
  );

  it('only describes an empty next hour with a known time inside the response window', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const empty = { ...scheduled, timings: [] };
    const start = Date.parse(empty.window.startInstant);
    const end = Date.parse(empty.window.endInstant);
    for (const now of [start, end - 1]) {
      expect(renderRow(empty, 'ready', now)).toContain('None in the next hour');
    }
    for (const now of [null, start - 1, end + 60_000]) {
      const html = renderRow(empty, 'ready', now);
      expect(html).not.toContain('None in the next hour');
      expect(html).toContain('Timetable unavailable');
    }
    const stale = renderRow(empty, 'error', start);
    expect(stale).not.toContain('None in the next hour');
    expect(stale).toContain('Timetable unavailable');
    expect(stale).toContain('Showing the last known response');
  });

  it('combines line facts, service directions and exits without repeating a visible station code', () => {
    const currentMembership = {
      lineId: 'EWL',
      code: 'EW21',
      structureType: 'elevated' as const,
      startedAt: '1988-03-12',
      branchId: 'EWL_MAIN_E',
      sequenceOrder: 1,
    };
    const oldMembership = {
      ...currentMembership,
      lineId: 'CCL',
      code: 'CC22',
      endedAt: '2011-10-08',
    };
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        <StationGuide
          arrivalLines={[
            {
              lineId: 'EWL',
              arrivalTimings: [
                { ...timing, lineId: 'EWL', serviceId: 'EWL_MAIN_E' },
              ],
            },
          ]}
          exits={[{ id: 1, label: 'A' }]}
          lineColors={{ EWL: '#006945', CCL: '#8a5000' }}
          lineNames={{ EWL: 'East–West Line', CCL: 'Circle Line' }}
          memberships={[currentMembership, oldMembership]}
          referenceAt="2026-10-24T12:00:00+08:00"
          stationId={scheduled.scope.stationId}
          visibleMemberships={[currentMembership]}
        />
      </IntlProvider>,
    );
    expect(html).toMatch(
      /East–West Line.*Opened.*12 Mar 1988.*Eastbound.*towards .*Destination/,
    );
    expect(html).toMatch(/Circle Line.*CC22.*Closed.*8 Oct 2011/);
    expect(html).toContain('Exit A');
    expect(html).not.toContain('EW21');
  });

  it('lists each distinct credit once across service rows, including stale schedules', () => {
    if (scheduled.source !== 'scheduled' || !scheduled.attributions?.[0]) {
      throw new Error('Missing fixture attribution');
    }
    const [credit] = scheduled.attributions;
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        <TimetableSources
          states={{
            east: { data: scheduled, status: 'ready' },
            west: {
              status: 'error',
              data: {
                ...scheduled,
                timings: [],
                attributions: [
                  credit,
                  { ...credit, retrievedAt: '2026-10-23T17:00:00Z' },
                  {
                    ...credit,
                    licenceUrl: 'https://example.com/other-licence',
                  },
                  { ...credit, retrievedAt: '2026-10-25T00:00:00Z' },
                  { ...credit, source: 'Another provider' },
                ],
              },
            },
          }}
        />
      </IntlProvider>,
    );
    expect(html).toContain('Timetable sources</summary>');
    expect(html).toContain(credit.source);
    expect(html).toContain('24 Oct 2026');
    expect(html).toContain('25 Oct 2026');
    expect(html).toContain('Another provider');
    expect(html).toContain('href="https://example.com/other-licence"');
    expect(html.match(/Dataset licence/g)).toHaveLength(4);
  });

  it('renders SSR/loading without an estimated time or calibration control', () => {
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        <ServiceArrivalSummary
          arrivalTiming={timing}
          lineColor="#123456"
          now={null}
        />
      </IntlProvider>,
    );
    expect(html).toContain('Checking timetable');
    expect(html).not.toContain('estimate');
    expect(html).not.toContain('Help improve');
    expect(html).not.toContain('Service ended');
    expect(html).not.toContain('First train');
  });
});

describe('station guide refresh session', () => {
  it('requests departures by direction for a loop and renders its service name', async () => {
    const loopTiming = {
      ...timing,
      isLoop: true as const,
      serviceName: {
        ...timing.serviceName,
        'en-SG': 'Loop Service (Clockwise)',
      },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const session = createArrivalRefresh(
      scheduled.scope.stationId,
      [{ lineId: timing.lineId, arrivalTimings: [loopTiming] }],
      () => {},
      fetcher,
    );
    await session.refresh();
    const url = new URL(String(fetcher.mock.calls[0][0]), 'http://localhost');
    expect(url.searchParams.get('loop')).toBe('true');
    expect(url.searchParams.get('destinationStationId')).toBe(
      timing.destinationStationId,
    );
    session.dispose();

    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        <ServiceArrivalSummary
          arrivalTiming={{
            ...loopTiming,
            serviceId: 'CCL_LOOP_CW',
            viaStationId: 'via-station',
            viaStationName: display.destinationName,
          }}
          arrivalState={{ data: scheduled, status: 'ready' }}
          lineColor="#123456"
          now={null}
        />
      </IntlProvider>,
    );
    expect(html).toMatch(
      />Clockwise<\/p>.*via <span data-station-id="via-station">Destination<\/span>/,
    );
    expect(html).not.toContain('towards');
    expect(html).not.toContain('D1');
    expect(html).toContain('12:10 am');
  });
  it('makes a fresh request after a report even when a poll was in flight', async () => {
    const pending = deferred();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockImplementation(async () => response());
    const session = createArrivalRefresh(
      scheduled.scope.stationId,
      lines,
      () => {},
      fetcher,
    );
    const poll = session.refresh();
    const refresh = session.refreshAfterReport();
    expect(fetcher).toHaveBeenCalledTimes(1);
    pending.resolve(response());
    await poll;
    await refresh;
    expect(fetcher).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it('deduplicates alternatives, bounds concurrency and joins interval refreshes', async () => {
    const pending = deferred();
    let states: ArrivalStates = {};
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      await pending.promise;
      const query = new URL(String(input), 'http://localhost').searchParams;
      return response({
        ...scheduled,
        scope: {
          ...scheduled.scope,
          serviceId: query.get('serviceId') ?? '',
        },
      });
    });
    const moreLines = [
      {
        ...lines[0],
        arrivalTimings: [
          ...lines[0].arrivalTimings,
          ...['other', 'third'].map((serviceId) => ({ ...timing, serviceId })),
        ],
      },
    ];
    const session = createArrivalRefresh(
      scheduled.scope.stationId,
      moreLines,
      (next) => {
        states = next;
      },
      fetcher,
    );
    const refresh = session.refresh();
    expect(session.refresh()).toBe(refresh);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toContain('/arrivals/v2?');
    expect(fetcher.mock.calls[0][0]).not.toContain('platformId');
    pending.resolve(response());
    await refresh;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(Object.values(states).map(({ status }) => status)).toEqual([
      'ready',
      'ready',
      'ready',
    ]);
    session.dispose();
  });

  it('ignores disposed station work and retains explicitly stale schedules on refresh failure', async () => {
    const old = deferred();
    const newer = {
      ...scheduled,
      window: { ...scheduled.window, startInstant: '2026-10-24T01:00:00Z' },
    };
    let states: ArrivalStates = {};
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(newer))
      .mockRejectedValueOnce(new Error('offline'));
    const update = vi.fn((next: ArrivalStates) => {
      states = next;
    });
    const session = createArrivalRefresh(
      scheduled.scope.stationId,
      lines,
      update,
      fetcher,
    );
    const first = session.refresh();
    session.dispose();
    const nextStationSession = createArrivalRefresh(
      scheduled.scope.stationId,
      lines,
      update,
      fetcher,
    );
    await nextStationSession.refresh();
    expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(
      true,
    );
    old.resolve(response());
    await first;
    expect(states[key].data).toEqual(newer);
    await nextStationSession.refresh();
    expect(states[key]).toEqual({ data: newer, status: 'error' });
    const late = deferred();
    fetcher.mockReturnValueOnce(late.promise);
    const beforeNavigation = nextStationSession.refresh();
    nextStationSession.dispose();
    const calls = update.mock.calls.length;
    late.resolve(response());
    await beforeNavigation;
    expect(update).toHaveBeenCalledTimes(calls);
  });

  it('keeps HTTP failures, invalid payloads and scope mismatches out of authoritative state, and times out requests', async () => {
    let states: ArrivalStates = {};
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(Response.json({ success: true, data: {} }))
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            ...scheduled,
            source: 'frequency',
            reason: 'coverage-gap',
            timing: { departures: [] },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          ...scheduled,
          scope: { ...scheduled.scope, serviceId: 'wrong' },
        }),
      );
    const session = createArrivalRefresh(
      scheduled.scope.stationId,
      lines,
      (next) => {
        states = next;
      },
      fetcher,
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      await session.refresh();
      expect(states[key]).toEqual({ data: null, status: 'error' });
    }
    vi.useFakeTimers();
    const late = deferred();
    fetcher.mockReturnValue(late.promise);
    const timed = session.refresh();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(states[key]).toEqual({ data: null, status: 'error' });
    late.resolve(response());
    await timed;
    expect(states[key].data).toBeNull();
    session.dispose();
  });
});
