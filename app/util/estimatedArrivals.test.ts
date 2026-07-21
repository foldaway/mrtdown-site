import type { ServiceRevision, Station } from '@mrtdown/core';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { getEstimatedStationArrivalTimings } from './estimatedArrivals';

const station = {
  id: 'alpha',
  firstLastTrain: {
    services: [
      {
        serviceId: 'alpha-eastbound',
        times: {
          weekday: {
            firstTrain: '05:00:00',
            lastTrain: '06:00:00',
          },
        },
      },
    ],
  },
} as Pick<Station, 'id' | 'firstLastTrain'>;

const revision = {
  path: {
    stations: [
      { stationId: 'alpha', displayCode: 'A1' },
      { stationId: 'bravo', displayCode: 'B2' },
    ],
  },
  estimatedFrequency: {
    source: {
      url: 'https://example.com/frequency',
      description: 'Test frequency profile',
      retrievedAt: '2026-07-20',
    },
    defaultHeadway: {
      minSeconds: 600,
      maxSeconds: 600,
      representativeSeconds: 600,
    },
    periods: [],
  },
} satisfies Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;

describe('getEstimatedStationArrivalTimings', () => {
  it('returns the next two departures from the frequency estimator', () => {
    const arrivalTimings = getEstimatedStationArrivalTimings({
      station,
      services: [
        {
          serviceId: 'alpha-eastbound',
          lineId: 'AL',
          destinationCode: 'B2',
          destinationName: {
            'en-SG': 'Bravo',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          revision,
        },
      ],
      referenceNow: DateTime.fromISO('2026-07-20T05:04:00', {
        zone: 'Asia/Singapore',
      }),
      publicHolidayDates: new Set(),
    });

    expect(arrivalTimings).toEqual([
      {
        serviceId: 'alpha-eastbound',
        lineId: 'AL',
        destinationCode: 'B2',
        destinationName: {
          'en-SG': 'Bravo',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        firstTrainTime: '05:00:00',
        lastTrainTime: '06:00:00',
        departures: [
          '2026-07-20T05:10:00.000+08:00',
          '2026-07-20T05:20:00.000+08:00',
        ],
      },
    ]);
  });

  it('omits services without an estimated frequency profile', () => {
    expect(
      getEstimatedStationArrivalTimings({
        station,
        services: [
          {
            serviceId: 'alpha-eastbound',
            lineId: 'AL',
            destinationCode: 'B2',
            destinationName: null,
            revision: {
              path: revision.path,
              estimatedFrequency: undefined,
            },
          },
        ],
        referenceNow: DateTime.fromISO('2026-07-20T05:04:00', {
          zone: 'Asia/Singapore',
        }),
        publicHolidayDates: new Set(),
      }),
    ).toEqual([]);
  });
});
