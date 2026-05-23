import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Line } from '~/types';
import { getOperatingHours } from './useOperatingHours';

const TEST_LINE: Line = {
  id: 'BPLRT',
  name: {
    'en-SG': 'Bukit Panjang LRT',
    'zh-Hans': null,
    ms: null,
    ta: null,
  },
  type: 'lrt',
  color: '#748274',
  startedAt: '1999-11-06',
  operatingHours: {
    weekdays: { start: '05:30', end: '05:30' },
    weekends: { start: '05:30', end: '05:30' },
  },
  operators: [],
};

describe('getOperatingHours', () => {
  it('treats matching start and end times as a next-day rollover', () => {
    const hours = getOperatingHours(
      TEST_LINE,
      DateTime.fromISO('2026-02-23T00:00:00', {
        zone: 'Asia/Singapore',
      }),
      'weekday',
    );

    expect(hours.start.toISO()).toBe('2026-02-23T05:30:00.000+08:00');
    expect(hours.end.toISO()).toBe('2026-02-24T05:30:00.000+08:00');
  });
});
