import { describe, expect, it } from 'vitest';
import { buildCrowdReportIngestPayload } from './crowdReportDispatch';

function payloadForTimestamp(observedAt: string | Date) {
  return buildCrowdReportIngestPayload({
    kind: 'report',
    id: 'report-1',
    reportIds: ['report-1'],
    createdAt: new Date('2026-10-21T00:22:59.482Z'),
    observedAt,
    lineIds: ['EWL'],
    stationIds: [],
    directionText: null,
    effect: 'delay',
    delayMinutes: 10,
    reportCount: 1,
    isStillHappening: true,
    rootUrl: 'https://mrtdown.example',
  }).payload.content[0];
}

describe('crowd report ingest timestamp boundary', () => {
  it.each([
    ['2026-10-21 00:20:00+00', '2026-10-21T00:20:00+00:00'],
    ['2026-10-21 08:20:00.123456+08', '2026-10-21T08:20:00.123456+08:00'],
    ['2026-10-20 17:20:00-07', '2026-10-20T17:20:00-07:00'],
    ['2026-10-21 05:50:00+05:30', '2026-10-21T05:50:00+05:30'],
    ['2026-10-21T00:20:00.000Z', '2026-10-21T00:20:00.000Z'],
    [new Date('2026-10-21T00:20:00Z'), '2026-10-21T00:20:00.000Z'],
  ])(
    'accepts database and ISO timestamps without changing their instant: %s',
    (value, expected) => {
      expect(payloadForTimestamp(value)).toMatchObject({
        observedAt: expected,
        createdAt: '2026-10-21T00:22:59.482Z',
      });
      expect(Date.parse(String(expected))).toBeLessThanOrEqual(
        Date.parse('2026-10-21T00:22:59.482Z'),
      );
    },
  );

  it.each([
    '2026-10-21T00:20:00',
    '2026-10-21 00:20:00',
    '2026-10-21',
    '2026-02-30 00:20:00+00',
    'not-a-timestamp',
    '2026-10-21 00:23:00+00',
  ])(
    'retains contract rejection for missing zones, invalid dates, and future observations: %s',
    (value) => {
      expect(() => payloadForTimestamp(value)).toThrow();
    },
  );
});
