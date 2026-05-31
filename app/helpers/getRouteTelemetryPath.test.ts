import { describe, expect, it } from 'vitest';
import { getRouteTelemetryPath } from './getRouteTelemetryPath';

describe('getRouteTelemetryPath', () => {
  it('normalizes supported localized public routes', () => {
    expect(getRouteTelemetryPath('/en-SG')).toBe('/');
    expect(getRouteTelemetryPath('/zh-Hans/statistics')).toBe('/statistics');
    expect(getRouteTelemetryPath('/ms/history/2026/05')).toBe(
      '/history/:year/:month',
    );
    expect(getRouteTelemetryPath('/ta/history/page/3')).toBe(
      '/history/page/:pageNum',
    );
  });

  it('removes high-cardinality entity IDs', () => {
    expect(getRouteTelemetryPath('/lines/EWL')).toBe('/lines/:lineId');
    expect(getRouteTelemetryPath('/operators/SMRT')).toBe(
      '/operators/:operatorId',
    );
    expect(getRouteTelemetryPath('/stations/NS1')).toBe('/stations/:stationId');
    expect(getRouteTelemetryPath('/issues/2026-05-31-example')).toBe(
      '/issues/:issueId',
    );
    expect(getRouteTelemetryPath('/status/CCL')).toBe('/status/:lineId');
  });

  it('buckets unknown routes to a fixed not-found path', () => {
    expect(getRouteTelemetryPath('/en-SG/2026-05-31-random')).toBe('/404');
    expect(getRouteTelemetryPath('/unexpected/deep/path')).toBe('/404');
  });
});
