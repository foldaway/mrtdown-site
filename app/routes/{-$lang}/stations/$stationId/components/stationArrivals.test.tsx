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
  serializeStationArrivalsV2,
  type StationArrivalsV2,
} from '~/util/stationArrivalsV2';
import {
  ArrivalRefreshNotice,
  ScheduledArrivalStatus,
} from './ScheduledArrivalStatus';
import { ServiceArrivalSummary } from './PlatformArrivalSummary';
import {
  arrivalBranchKey,
  type ArrivalStates,
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
          precision: 'approximate',
          timepoint: 0,
          stopSequence: '002',
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
) {
  return renderToStaticMarkup(
    <IntlProvider locale="en-SG">
      <ServiceArrivalSummary
        arrivalTiming={timing}
        arrivalState={{ data, status }}
        lineColor="#123456"
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
  it('renders exact and approximate scheduled clock times once per train, without calibration controls', () => {
    const html = renderRow(scheduled);
    expect(html).toContain('Scheduled');
    expect(html).toContain('Approximate scheduled');
    expect(html).toContain('Alternative platforms for the same train');
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html).not.toContain('Frequency estimate');
    expect(html).not.toContain('Help improve');
    expect(html).not.toContain(departure.manifestSha256);
    expect(html).not.toContain(departure.providerTripId);
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
        <IntlProvider locale="en-SG">
          <ScheduledArrivalStatus data={empty} lineColor="#123456" />
          <ArrivalRefreshNotice hasScope={false} />
        </IntlProvider>,
      ),
    ).toContain('refresh is unavailable');
  });

  it('renders SSR/loading without an estimated time or calibration control', () => {
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG">
        <ServiceArrivalSummary arrivalTiming={timing} lineColor="#123456" />
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
