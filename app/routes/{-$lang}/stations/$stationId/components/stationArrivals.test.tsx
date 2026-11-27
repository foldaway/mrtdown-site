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
import { ArrivalReports } from './ArrivalReports';
import {
  groupArrivalSummaries,
  sharedArrivalDisplay,
} from './groupArrivalSummaries';
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
      <ArrivalReports
        stationId={scheduled.scope.stationId}
        timings={[timing]}
        states={{ [key]: { data, status } }}
        onArrivalReported={onArrivalReported}
      >
        <ServiceArrivalSummary
          arrivalTiming={timing}
          arrivalState={{ data, status }}
          lineColor="#123456"
          now={now}
        />
      </ArrivalReports>
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
  it('explains the A/B loop directions on platform 2 while platform 1 keeps the shared destination', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const stationName = (value: string) => ({
      'en-SG': value,
      'zh-Hans': null,
      ms: null,
      ta: null,
    });
    const branches = [
      {
        serviceId: 'BPLRT_A',
        name: 'Service A',
        viaId: 'SNJ',
        viaName: 'Senja',
      },
      {
        serviceId: 'BPLRT_B',
        name: 'Service B',
        viaId: 'PTR',
        viaName: 'Petir',
      },
    ].map((service) => ({
      ...timing,
      lineId: 'BPLRT',
      serviceId: service.serviceId,
      serviceName: stationName(service.name),
      destinationStationId: 'CCK',
      destinationName: stationName('Choa Chu Kang'),
      isLoop: true as const,
      platformViaStations: [
        {
          platformId: 'BKP_BPLRT_2',
          stationId: service.viaId,
          stationName: stationName(service.viaName),
        },
      ],
    }));
    const states: ArrivalStates = Object.fromEntries(
      branches.map((branch) => [
        arrivalBranchKey(
          branch.lineId,
          branch.serviceId,
          branch.destinationStationId,
        ),
        {
          status: 'ready',
          data: {
            ...scheduled,
            scope: {
              ...scheduled.scope,
              stationId: 'BKP',
              lineId: branch.lineId,
              serviceId: branch.serviceId,
              destinationStationId: 'CCK',
            },
            timings: scheduled.timings.map((platform, index) => ({
              ...platform,
              platforms: [
                { id: `BKP_BPLRT_${index + 1}`, label: String(index + 1) },
              ],
            })),
          },
        },
      ]),
    );
    const groups = groupArrivalSummaries(branches, states, null);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.length)).toEqual([2, 2]);
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        {groups.map(([first, ...sharedArrivals]) => (
          <ServiceArrivalSummary
            {...first}
            sharedArrivals={sharedArrivals}
            key={JSON.stringify(first.arrivalState?.data)}
            lineColor="#748477"
            now={null}
          />
        ))}
      </IntlProvider>,
    );
    expect(
      html.match(/towards <span data-station-id="CCK">Choa Chu Kang/g),
    ).toHaveLength(1);
    expect(html).toContain('A via <span data-station-id="SNJ">Senja</span>');
    expect(html).toContain('B via <span data-station-id="PTR">Petir</span>');
    expect(html.match(/>Service A and Service B<\/p>/g)).toHaveLength(2);
    const platform2 = groups[1][0].arrivalState?.data;
    if (platform2?.source !== 'scheduled') throw new Error('fixture');
    const alternatives = {
      ...states,
      [arrivalBranchKey(branches[0].lineId, branches[0].serviceId, 'CCK')]: {
        status: 'ready' as const,
        data: {
          ...platform2,
          timings: platform2.timings.map((item) => ({
            ...item,
            platforms: [
              { id: 'BKP_BPLRT_1', label: '1' },
              { id: 'BKP_BPLRT_2', label: '2' },
            ],
          })),
        },
      },
    };
    expect(
      groupArrivalSummaries([branches[0]], alternatives, null)[0][0]
        .arrivalTiming.viaStationId,
    ).toBeUndefined();
  });

  it('keeps branch report targets outside rows when platforms expire and shared groups split', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const otherTiming = { ...timing, serviceId: 'other-service' };
    const states: ArrivalStates = {
      [key]: {
        status: 'ready',
        data: {
          ...scheduled,
          timings: scheduled.timings.map((platform) => ({
            ...platform,
            departures: platform.departures.slice(0, 1),
          })),
        },
      },
      [arrivalBranchKey(
        timing.lineId,
        otherTiming.serviceId,
        timing.destinationStationId,
      )]: {
        status: 'ready',
        data: {
          ...scheduled,
          scope: { ...scheduled.scope, serviceId: otherTiming.serviceId },
          timings: [
            {
              ...scheduled.timings[0],
              departures: [scheduled.timings[0].departures[1]],
            },
          ],
        },
      },
    };
    const render = (now: number) =>
      renderToStaticMarkup(
        <IntlProvider locale="en-SG" defaultLocale="en-SG">
          <ArrivalReports
            stationId={scheduled.scope.stationId}
            timings={[timing, otherTiming]}
            states={states}
            onArrivalReported={async () => {}}
          >
            <ul>
              {groupArrivalSummaries([timing, otherTiming], states, now).map(
                ([first, ...sharedArrivals]) => (
                  <ServiceArrivalSummary
                    {...first}
                    sharedArrivals={sharedArrivals}
                    key={JSON.stringify(first.arrivalState?.data)}
                    lineColor="#748477"
                    now={now}
                  />
                ),
              )}
            </ul>
          </ArrivalReports>
        </IntlProvider>,
      );
    const before = render(Date.parse('2026-10-24T16:09:00Z'));
    const after = render(Date.parse('2026-10-24T16:10:15Z'));
    const formIds = (html: string) =>
      [...html.matchAll(/id="([^"]+-form)"/g)].map((match) => match[1]);
    expect(formIds(before)).toHaveLength(2);
    expect(formIds(after)).toEqual(formIds(before));
    for (const html of [before, after]) {
      expect(html.indexOf(`id="${formIds(html)[0]}"`)).toBeGreaterThan(
        html.lastIndexOf('</ul>'),
      );
    }
    expect(before.match(/aria-label="Report an arrival"/g)).toHaveLength(1);
    expect(after.match(/aria-label="Report an arrival"/g)).toHaveLength(2);
  });

  it('preserves separate trips within one service when they share a time slot', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const platform = scheduled.timings[0];
    const firstDeparture = platform.departures[0];
    const members = [timing.serviceId, 'other-service'].map((serviceId) => ({
      arrivalTiming: { ...timing, serviceId },
      arrivalState: {
        status: 'ready' as const,
        data: {
          ...scheduled,
          scope: { ...scheduled.scope, serviceId },
          timings: [
            {
              ...platform,
              departures:
                serviceId === timing.serviceId
                  ? [
                      firstDeparture,
                      {
                        ...firstDeparture,
                        providerTripId: 'second-simultaneous-trip',
                      },
                    ]
                  : [firstDeparture],
            },
          ],
        },
      },
    }));
    const combined = sharedArrivalDisplay(members);
    expect(combined?.data.timings[0].departures).toHaveLength(2);
    expect(members[0].arrivalState.data.timings[0].departures).toHaveLength(2);
  });

  it('renders matching A/B schedules once per platform while retaining both services and report scopes', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const serviceA = {
      ...timing,
      serviceName: { ...timing.serviceName, 'en-SG': 'Service A' },
    };
    const serviceB = {
      ...timing,
      serviceId: 'service-b',
      serviceName: { ...timing.serviceName, 'en-SG': 'Service B' },
    };
    const secondSchedule = {
      ...scheduled,
      scope: { ...scheduled.scope, serviceId: serviceB.serviceId },
      timings: scheduled.timings.map((timing) => ({
        ...timing,
        departures: timing.departures.map((departure) => ({
          ...departure,
          providerTripId: `different-${departure.providerTripId}`,
        })),
      })),
      recentCrowdArrival,
    };
    const states: ArrivalStates = {
      [key]: { data: scheduled, status: 'ready' },
      [arrivalBranchKey(
        timing.lineId,
        serviceB.serviceId,
        timing.destinationStationId,
      )]: {
        data: secondSchedule,
        status: 'ready',
      },
    };
    const groups = groupArrivalSummaries([serviceA, serviceB], states, null);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[0][1].arrivalState?.data?.scope.serviceId).toBe(
      serviceB.serviceId,
    );
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        <ArrivalReports
          stationId={scheduled.scope.stationId}
          timings={[serviceA, serviceB]}
          states={states}
          onArrivalReported={async () => {}}
        >
          {groups.map(([first, ...sharedArrivals]) => (
            <ServiceArrivalSummary
              {...first}
              sharedArrivals={sharedArrivals}
              key={JSON.stringify(first.arrivalState?.data)}
              lineColor="#748477"
              now={Date.parse('2026-10-24T16:08:30Z')}
            />
          ))}
        </ArrivalReports>
      </IntlProvider>,
    );
    expect(html.match(/>Service A and Service B<\/p>/g)).toHaveLength(2);
    expect(html.match(/>12 <span/g)).toHaveLength(1);
    expect(html.match(/aria-label="Report an arrival"/g)).toHaveLength(1);
    expect(html).toContain('>Service A</p>');
    expect(html).toContain('>Service B</p>');
    expect(html).toContain('Rider-reported arrival');

    for (const [changed, expectedCount] of [
      [
        {
          ...secondSchedule,
          coverage: { ...secondSchedule.coverage, complete: false },
        },
        3,
      ],
      [
        {
          ...secondSchedule,
          timings: secondSchedule.timings.map((item) => ({
            ...item,
            platforms: item.platforms.map((platform) => ({
              ...platform,
              id: `other-${platform.id}`,
            })),
          })),
        },
        4,
      ],
      [
        {
          ...secondSchedule,
          timings: secondSchedule.timings.map((item) => ({
            ...item,
            departures: item.departures.map((departure) => ({
              ...departure,
              time: '2026-10-24T16:25:00Z',
            })),
          })),
        },
        2,
      ],
      [
        {
          ...secondSchedule,
          timings: secondSchedule.timings.map((item, index) =>
            index === 0
              ? item
              : {
                  ...item,
                  departures: item.departures.map((departure) => ({
                    ...departure,
                    time: '2026-10-24T16:25:00Z',
                  })),
                },
          ),
        },
        2,
      ],
    ] as const) {
      expect(
        groupArrivalSummaries(
          [serviceA, serviceB],
          {
            ...states,
            [arrivalBranchKey(
              timing.lineId,
              serviceB.serviceId,
              timing.destinationStationId,
            )]: {
              data: changed,
              status: 'ready',
            },
          },
          null,
        ),
      ).toHaveLength(expectedCount);
    }
    expect(
      groupArrivalSummaries(
        [serviceA, { ...serviceB, viaStationId: 'other-direction' }],
        states,
        null,
      ),
    ).toHaveLength(4);

    const mixedGroups = groupArrivalSummaries(
      [serviceA, serviceB],
      {
        ...states,
        [arrivalBranchKey(
          timing.lineId,
          serviceB.serviceId,
          timing.destinationStationId,
        )]: {
          status: 'ready',
          data: {
            ...secondSchedule,
            timings: secondSchedule.timings.map((item) => ({
              ...item,
              departures: item.departures.map((departure, index) =>
                index === 2
                  ? { ...departure, time: '2026-10-24T16:25:00Z' }
                  : departure,
              ),
            })),
          },
        },
      },
      null,
    );
    expect(mixedGroups).toHaveLength(2);
    const mixed = sharedArrivalDisplay(mixedGroups[0]);
    const slots = mixed?.data.timings[0].departures;
    expect(slots?.map(({ time }) => time)).toEqual([
      '2026-10-24T16:10:00Z',
      '2026-10-24T16:15:00Z',
      '2026-10-24T16:20:00Z',
      '2026-10-24T16:25:00Z',
    ]);
    expect(
      slots?.map((departure) =>
        mixed?.departureServices
          ?.get(departure)
          ?.map(({ serviceId }) => serviceId),
      ),
    ).toEqual([
      [timing.serviceId, serviceB.serviceId],
      [timing.serviceId, serviceB.serviceId],
      [timing.serviceId],
      [serviceB.serviceId],
    ]);
  });

  it('uses the final destination when a loop has no unambiguous branch-wide via', () => {
    const html = renderToStaticMarkup(
      <IntlProvider locale="en-SG" defaultLocale="en-SG">
        <ServiceArrivalSummary
          arrivalTiming={{
            ...timing,
            isLoop: true,
            serviceName: { ...timing.serviceName, 'en-SG': 'Service A' },
            destinationStationId: 'CCK',
            destinationName: {
              'en-SG': 'Choa Chu Kang',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
          }}
          arrivalState={{ data: scheduled, status: 'ready' }}
          lineColor="#748477"
          now={null}
        />
      </IntlProvider>,
    );
    // Both platform groups keep their departures, without borrowing the
    // outbound visit's direction for the return visit.
    expect(
      html.match(/towards <span data-station-id="CCK">Choa Chu Kang/g),
    ).toHaveLength(2);
    expect(html).not.toContain('via ');
    expect(html.match(/<time/g)).toHaveLength(4);
  });

  it('shows the next three departures per platform group as read-only times', () => {
    const html = renderRow(scheduled);
    expect(html).toMatch(/>2 <span[^>]*>mins<\/span>/);
    expect(html).toMatch(
      /class="sr-only">then<\/span>.*≈.*7 <span[^>]*>mins<\/span>/,
    );
    expect(html).toMatch(/>2 <span class="sr-only">mins<\/span>/);
    expect(html).toMatch(/>7 <span class="sr-only">mins<\/span>/);
    expect(html).toMatch(/>12 <span class="(?!sr-only)[^"]+">mins<\/span>/);
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

  it('limits each platform group to three upcoming departures', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const html = renderRow({
      ...scheduled,
      timings: scheduled.timings.map((timing, index) =>
        index === 0
          ? {
              ...timing,
              departures: [
                ...timing.departures,
                {
                  ...timing.departures[0],
                  time: '2026-10-24T16:25:00Z',
                  stopSequence: '005',
                },
              ],
            }
          : timing,
      ),
    });
    expect(html).toMatch(/>12 <span[^>]*>mins<\/span>/);
    expect(html).not.toMatch(/>17 <span[^>]*>mins<\/span>/);
  });

  it('labels stale clock times and advances past elapsed departures in fresh responses', () => {
    const stale = renderRow(scheduled, 'error');
    expect(stale).toContain('Showing the last known response');
    expect(stale).not.toMatch(/>2 <span[^>]*>mins<\/span>/);
    expect(stale).not.toContain('>7 min<');
    expect(stale.match(/<time/g)).toHaveLength(4);
    expect(stale).toContain('>Scheduled</p>');
    expect(stale).toContain('12:10 am');
    expect(stale).toContain('12:20 am');
    const elapsed = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T16:10:15Z'),
    );
    expect(elapsed.replace(/<[^>]*>/g, '')).not.toMatch(/\b0 mins\b/);
    expect(elapsed).toMatch(/≈.*5 <span[^>]*>mins<\/span>/);
    expect(elapsed).toMatch(
      /class="sr-only">then<\/span>.*10 <span[^>]*>mins<\/span>/,
    );
    expect(elapsed).not.toContain('<time');
    expect(elapsed).not.toContain('12:10 am');
  });

  it('advances at the scheduled instant and keeps the next three upcoming departures', () => {
    const html = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T16:10:00Z'),
    );
    expect(html).toMatch(/≈.*5 <span[^>]*>mins<\/span>/);
    expect(html).toMatch(
      /class="sr-only">then<\/span>.*10 <span[^>]*>mins<\/span>/,
    );
    expect(html).not.toContain('<time');
    expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\b0 mins\b/);
  });

  it('shows a neutral empty state when every returned departure has passed', () => {
    const html = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T16:20:01Z'),
      async () => {},
    );
    expect(html).toContain('No upcoming times');
    expect(html).not.toContain('None in the next hour');
    expect(html).not.toContain('<time');
    expect(html).toContain('Report an arrival');
  });

  it('keeps the one-hour boundary in minutes', () => {
    const html = renderRow(
      scheduled,
      'ready',
      Date.parse('2026-10-24T15:10:00Z'),
    );
    expect(html).toMatch(/>60 <span[^>]*>mins<\/span>/);
    expect(html).not.toContain('1h 0m');
  });

  it('shows recent reports separately from the timetable and expires them on the client', () => {
    const recent = { ...scheduled, recentCrowdArrival };
    const html = renderRow(recent, 'ready', undefined, async () => {});
    expect(html).toContain('Rider-reported arrival');
    expect(html).toMatch(/>2 <span[^>]*>mins<\/span>/);
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
    expect(report).toBeGreaterThan(html.indexOf('>then</span>'));
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
      expect(row).not.toContain('>—</span>');
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
    expect(partialWithTimes).toMatch(/>2 <span[^>]*>mins<\/span>/);
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

  it('accepts fresh empty responses ahead of the sampled clock while rejecting expired or stale results', () => {
    if (scheduled.source !== 'scheduled') throw new Error('fixture');
    const empty = { ...scheduled, timings: [] };
    const start = Date.parse(empty.window.startInstant);
    const end = Date.parse(empty.window.endInstant);
    for (const now of [start - 15_000, start - 1, start, end - 1]) {
      expect(renderRow(empty, 'ready', now)).toContain('None in the next hour');
    }
    for (const now of [null, end, end + 60_000]) {
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
