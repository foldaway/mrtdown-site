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
import { ArrivalRefreshNotice } from './ArrivalRefreshNotice';
import { ServiceArrivalSummary } from './PlatformArrivalSummary';
import { ScheduledArrivalStatus } from './ScheduledArrivalStatus';
import {
  type ArrivalStates,
  arrivalBranchKey,
  createArrivalRefresh,
} from './stationArrivalRefresh';
import type { ArrivalLine } from './stationGuide.types';

type MockLinkProps = { children: React.ReactNode };
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: MockLinkProps) => <span>{children}</span>,
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
const lines = [{ lineId: timing.lineId, arrivalTimings: [timing, timing] }];
const key = arrivalBranchKey(
  timing.lineId,
  timing.serviceId,
  timing.destinationStationId,
);
function renderRow(
  data: StationArrivalsV2 | null,
  status: 'ready' | 'error' | 'loading' = 'ready',
  now = Date.parse('2026-10-24T16:08:30Z'),
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
  it('highlights the next two departures per platform group and keeps later times available', () => {
    const html = renderRow(scheduled);
    expect(html).toContain('2 min');
    expect(html).toContain('then 7 min');
    expect(html).toContain('Scheduled');
    expect(html).toContain('Approximate scheduled');
    expect(html).toContain('Service details');
    expect(html).toContain('Alternative platforms for the same train');
    expect(html).toContain('GTFS schedule data from');
    expect(html).toContain('href="https://example.com/licence"');
    expect(html.match(/<ol/g)).toHaveLength(3);
    expect(html.match(/<time/g)).toHaveLength(4);
    expect(html).toContain('Later departures</summary>');
    expect(html).toMatch(
      /<time[^>]+datetime="2026-10-24T16:10:00Z"[^>]*>12:10 am<\/time>/i,
    );
    expect(html).not.toContain('Frequency estimate');
    expect(html).not.toContain('Help improve');
    expect(html).not.toContain(departure.manifestSha256);
    expect(html).not.toContain(departure.providerTripId);
  });

  it('uses clock times for stale responses and departures whose scheduled time has passed', () => {
    const stale = renderRow(scheduled, 'error');
    expect(stale).toContain('Showing the last known response');
    expect(stale).not.toContain('2 min');
    expect(stale).not.toContain('then 7 min');
    const elapsed = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T16:10:15Z'),
    );
    expect(elapsed).not.toContain('0 min');
    expect(elapsed).toContain('then 5 min');
    expect(elapsed.match(/<time/g)).toHaveLength(4);
  });

  it('shows recent reports separately from the timetable and expires them on the client', () => {
    const recent = {
      ...scheduled,
      recentCrowdArrival: {
        reportedAt: '2026-10-24T16:08:00Z',
        expectedAt: '2026-10-24T16:11:00Z',
        expiresAt: '2026-10-24T16:12:00Z',
      },
    };
    const html = renderRow(recent, 'ready', undefined, async () => {});
    expect(html).toContain('Rider-reported arrival');
    expect(html).toContain('2 min');
    expect(html).toContain('Report an arrival');
    const unavailable = renderRow({
      ...recent,
      source: 'unavailable',
      reason: 'timetable-unavailable',
    });
    expect(unavailable).toContain('Timetable unavailable');
    expect(unavailable).toContain('Rider-reported arrival');
    const expired = renderRow(
      recent,
      'ready',
      Date.parse(recent.recentCrowdArrival.expiresAt),
    );
    expect(expired).not.toContain('Rider-reported arrival');
  });

  it('keeps empty, partial, unavailable and stale responses distinct without SSR estimates', () => {
    if (scheduled.source !== 'scheduled') {
      throw new Error('fixture');
    }
    const empty = { ...scheduled, timings: [] };
    const html = renderRow(empty);
    expect(html).toContain('No scheduled departures between');
    expect(html).not.toContain('Service ended');
    expect(html).not.toContain('Frequency estimate');
    const partial = renderRow({
      ...empty,
      reason: 'incomplete',
      coverage: {
        ...empty.coverage,
        complete: false,
        untimedDepartureCount: 2,
      },
    });
    expect(partial).toContain('Incomplete timetable');
    expect(partial).toContain('No timed departures available');
    const unavailable = renderRow({
      ...empty,
      source: 'unavailable',
      reason: 'timetable-unavailable',
    });
    expect(unavailable).toContain('Arrivals unavailable');
    expect(unavailable).not.toContain('Frequency estimate');
    expect(renderRow(empty, 'error')).toContain(
      'Showing the last known response',
    );
    expect(renderRow(null, 'error')).toContain(
      'Couldn’t refresh the timetable',
    );
    // Exercise the standalone status components used by all service rows.
    expect(
      renderToStaticMarkup(
        <IntlProvider locale="en-SG" defaultLocale="en-SG">
          <ScheduledArrivalStatus data={empty} lineColor="#123456" now={null} />
          <ArrivalRefreshNotice hasScope={false} />
        </IntlProvider>,
      ),
    ).toContain('refresh is unavailable');
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
