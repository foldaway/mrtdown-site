import { Temporal } from '@js-temporal/polyfill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStationArrivalScopeError } from '~/util/dbQueries/withSelectedScheduledTimetable';
import { buildScheduledStationArrivalLines } from '~/util/scheduledStationArrivals';
import {
  departure,
  display,
  result,
  scope,
} from '~/util/scheduledStationArrivals.fixture';
import { selectStationArrivalSource } from '~/util/stationArrivalSourcePolicy';

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), read: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock('~/db', () => ({ getDb: mocks.getDb }));
vi.mock('~/util/dbQueries/readStationArrivalSource', () => ({
  readStationArrivalSource: mocks.read,
}));

import { Route } from './api.stations.$stationId.arrivals.v2';

type RouteContext = { params: { stationId: string }; request: Request };
const handler = (
  Route as unknown as {
    options: {
      server: {
        handlers: { GET: (context: RouteContext) => Promise<Response> };
      };
    };
  }
).options.server.handlers.GET;
const query = 'lineId=line&serviceId=service&destinationStationId=destination';
function request(search = query, stationId = scope.stationId) {
  return handler({
    params: { stationId },
    request: new Request(
      `http://localhost/api/stations/${stationId}/arrivals/v2?${search}`,
    ),
  });
}

describe('station arrivals v2 contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(Temporal.Now, 'instant').mockReturnValue(
      Temporal.Instant.from(result.window.startInstant),
    );
    mocks.getDb.mockReturnValue('database');
  });

  it('uses one bounded server clock and serializes scheduled groups, precision and occurrence identity', async () => {
    const scheduled = buildScheduledStationArrivalLines(
      {
        ...result,
        scope: { ...scope, platformId: 'a' },
        departures: [
          departure,
          {
            ...departure,
            precision: 'approximate',
            timepoint: 0,
            stopSequence: '002',
          },
          { ...departure, platformIds: ['a'], stopSequence: '003' },
        ],
      },
      display,
    );
    mocks.read.mockResolvedValue(selectStationArrivalSource(scheduled));
    const response = await request(`${query}&platformId=a`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Temporal.Now.instant).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledWith('database', {
      scope: { ...scope, platformId: 'a' },
      referenceInstant: result.window.startInstant,
      endInstant: result.window.endInstant,
      limit: 20,
    });
    const { data } = await response.json();
    expect(Object.keys(data).sort()).toEqual([
      'coverage',
      'reason',
      'schemaVersion',
      'scope',
      'source',
      'timings',
      'window',
    ]);
    expect(data.scope).toEqual({ ...scope, platformId: 'a' });
    expect(data.window).toEqual({ ...result.window, limit: 20 });
    expect(data.coverage).toEqual({
      complete: true,
      untimedDepartureCount: 0,
      serviceDays: [
        {
          serviceDate: departure.serviceDate,
          source: {
            manifestSha256: departure.manifestSha256,
            snapshotSha256: departure.snapshotSha256,
          },
          reasons: ['eligible'],
          rollback: null,
        },
      ],
      unavailableReasons: [],
    });
    expect(data.timings[0]).toEqual({
      serviceName: display.serviceName,
      destinationName: display.destinationName,
      destinationCode: display.destinationCode,
      platforms: [
        { id: 'a', label: 'Platform' },
        { id: 'b', label: 'Platform' },
      ],
      departures: ['exact', 'approximate'].map((precision, index) => ({
        time: departure.departureInstant,
        basis: 'scheduled',
        precision,
        serviceDate: departure.serviceDate,
        providerTripId: departure.providerTripId,
        providerStopId: departure.providerStopId,
        stopSequence: index === 0 ? departure.stopSequence : '002',
        revisionId: departure.revisionId,
        manifestSha256: departure.manifestSha256,
        snapshotSha256: departure.snapshotSha256,
      })),
    });
    expect(data.timings[1].platforms).toEqual([{ id: 'a', label: 'Platform' }]);
    expect(data.timings[1].departures).toHaveLength(1);
    expect(data.source).toBe('scheduled');
    expect(data.reason).toBe('complete');
    expect(data.schemaVersion).toBe(2);
  });

  it('keeps complete empty, partial and untimed scheduled coverage distinct', async () => {
    for (const input of [
      result,
      { ...result, complete: false, untimedDepartureCount: 2 },
      {
        ...result,
        complete: false,
        departures: [departure],
        serviceDays: [
          ...result.serviceDays,
          {
            ...result.serviceDays[0],
            serviceDate: '2026-10-25',
            selected: null,
            attempts: [],
          },
        ],
      },
    ]) {
      mocks.read.mockResolvedValue(
        selectStationArrivalSource(
          buildScheduledStationArrivalLines(input, display),
        ),
      );
      const response = await request();
      const { data } = await response.json();
      expect(data.source).toBe('scheduled');
      expect(data.reason).toBe(input.complete ? 'complete' : 'incomplete');
      expect(data.coverage.complete).toBe(input.complete);
      expect(data.coverage.untimedDepartureCount).toBe(
        input.untimedDepartureCount,
      );
      expect(data.timings).toHaveLength(input.departures.length ? 1 : 0);
      expect(data.coverage.serviceDays).toHaveLength(input.serviceDays.length);
    }
  });

  it('returns unavailable when no timetable artifact covers the branch', async () => {
    mocks.read.mockResolvedValue(
      selectStationArrivalSource(
        buildScheduledStationArrivalLines(
          {
            ...result,
            complete: false,
            serviceDays: [
              { ...result.serviceDays[0], selected: null, attempts: [] },
            ],
          },
          display,
        ),
      ),
    );
    const response = await request();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({
      source: 'unavailable',
      reason: 'timetable-unavailable',
    });
    expect(data).not.toHaveProperty('timing');
    expect(data).not.toHaveProperty('timings');
  });

  it('returns unavailable coverage and minimal rejected rollback audit without private review authority', async () => {
    const scheduled = buildScheduledStationArrivalLines(
      {
        ...result,
        complete: false,
        serviceDays: structuredClone(result.serviceDays),
      },
      display,
    );
    const day = scheduled.serviceDays[0];
    day.rollback = {
      status: 'rejected',
      selectionInstant: result.window.startInstant,
      blockers: ['rollback-from-is-not-current-selection'],
      review: {
        schemaVersion: 1,
        documentKind: 'scheduled-timetable-rollback-review',
        from: {
          manifestSha256: 'a'.repeat(64),
          snapshotSha256: 'b'.repeat(64),
        },
        to: { manifestSha256: 'c'.repeat(64), snapshotSha256: 'd'.repeat(64) },
        dateRange: { startDate: day.serviceDate, endDate: day.serviceDate },
        scope,
        reviewer: 'Private reviewer',
        reviewedAt: result.window.startInstant,
        reason: 'Private review',
      },
    };
    mocks.read.mockResolvedValue(selectStationArrivalSource(scheduled));
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.source).toBe('unavailable');
    expect(body.data.reason).toBe('timetable-unavailable');
    expect(body.data.coverage.serviceDays[0].rollback).toEqual({
      status: 'rejected',
      blockers: ['rollback-from-is-not-current-selection'],
    });
    expect(Object.keys(body.data).sort()).toEqual([
      'coverage',
      'reason',
      'schemaVersion',
      'scope',
      'source',
      'window',
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /Private|reviewer|receipt|projectionId|manifest"|selectionInstant/,
    );
  });

  it('rejects malformed, duplicate, unknown and authority-bearing input before opening the reader', async () => {
    for (const search of [
      '',
      query.replace('lineId=line', 'lineId='),
      query.replace('serviceId=service', 'serviceId=bad%20id'),
      `${query}&platformId=`,
      `${query}&lineId=other`,
      `${query}&stationId=other`,
      `${query}&limit=999`,
      `${query}&horizonMinutes=999`,
      `${query}&referenceInstant=2026-10-24`,
      `${query}&readCanonicalTopology=override`,
      `${query}&topologySha256=hash`,
      `${query}&rollback=review`,
      `${query}&selectionInstant=2026-10-24`,
      `${query}&sourceReview=review`,
      `${query}&platformId=${'x'.repeat(129)}`,
      `${query}&extra=${'x'.repeat(2048)}`,
    ]) {
      const response = await request(search);
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect((await request(query, 'bad station')).status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(Temporal.Now.instant).not.toHaveBeenCalled();
  });

  it.each([
    [
      new InvalidStationArrivalScopeError('unknown canonical scope'),
      400,
      'Invalid arrival scope or query',
    ],
    [
      new Error('Canonical promotion incomplete'),
      500,
      'Arrival refresh failed',
    ],
    [
      new Error('Private lineage/database failure'),
      500,
      'Arrival refresh failed',
    ],
  ])(
    'distinguishes invalid scope from read failure (%s)',
    async (error, status, message) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.read.mockRejectedValue(error);
      const response = await request();
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ success: false, error: message });
      expect(log).toHaveBeenCalledTimes(status === 500 ? 1 : 0);
    },
  );
});
