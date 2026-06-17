import { describe, expect, it, vi } from 'vitest';
import { buildCrowdReportFormOptions } from './report.functions';

vi.mock('cloudflare:workers', () => ({
  env: {},
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (handler: unknown) => handler,
  }),
}));

function name(en: string) {
  return { en } as never;
}

describe('buildCrowdReportFormOptions', () => {
  it('builds station search metadata and guided line choices', () => {
    const options = buildCrowdReportFormOptions({
      referenceDate: '2026-06-17',
      lines: [
        { id: 'BPLRT', name: name('Bukit Panjang LRT'), color: '#748477' },
        { id: 'DTL', name: name('Downtown Line'), color: '#005ec4' },
      ],
      stations: [
        { id: 'BP6', name: name('Bukit Panjang') },
        { id: 'DT1', name: name('Bukit Panjang') },
      ],
      stationCodes: [
        { stationId: 'BP6', lineId: 'BPLRT', code: 'BP6' },
        { stationId: 'BP6', lineId: 'BPLRT', code: 'BP6' },
        { stationId: 'BP6', lineId: 'DTL', code: 'DT1' },
      ],
      services: [],
      serviceRevisions: [],
      servicePathEntries: [],
    });

    expect(options.stations).toEqual([
      {
        id: 'BP6',
        name: name('Bukit Panjang'),
        codes: ['BP6', 'DT1'],
        codePills: [
          { lineId: 'BPLRT', code: 'BP6' },
          { lineId: 'DTL', code: 'DT1' },
        ],
        lineIds: ['BPLRT', 'DTL'],
      },
      {
        id: 'DT1',
        name: name('Bukit Panjang'),
        codes: [],
        codePills: [],
        lineIds: [],
      },
    ]);
  });

  it('derives train direction choices and affected-stop paths from the active service revision', () => {
    const options = buildCrowdReportFormOptions({
      referenceDate: '2026-06-17',
      lines: [
        { id: 'BPLRT', name: name('Bukit Panjang LRT'), color: '#748477' },
      ],
      stations: [
        { id: 'BP1', name: name('Choa Chu Kang') },
        { id: 'BP6', name: name('Bukit Panjang') },
        { id: 'BP13', name: name('Senja') },
        { id: 'BP14', name: name('Ten Mile Junction') },
      ],
      stationCodes: [],
      services: [{ id: 'svc-bplrt', lineId: 'BPLRT' }],
      serviceRevisions: [
        {
          id: 'legacy',
          serviceId: 'svc-bplrt',
          start_at: '2010-01-01',
          end_at: '2025-12-31',
          updated_at: '2025-12-31T00:00:00.000Z',
        },
        {
          id: 'current',
          serviceId: 'svc-bplrt',
          start_at: '2026-01-01',
          end_at: '2026-12-31',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'future',
          serviceId: 'svc-bplrt',
          start_at: '2027-01-01',
          end_at: null,
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
      servicePathEntries: [
        {
          serviceRevisionId: 'legacy',
          serviceId: 'svc-bplrt',
          stationId: 'BP1',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'legacy',
          serviceId: 'svc-bplrt',
          stationId: 'BP14',
          pathIndex: 1,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-bplrt',
          stationId: 'BP1',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-bplrt',
          stationId: 'BP6',
          pathIndex: 1,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-bplrt',
          stationId: 'BP13',
          pathIndex: 2,
        },
        {
          serviceRevisionId: 'future',
          serviceId: 'svc-bplrt',
          stationId: 'BP14',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'future',
          serviceId: 'svc-bplrt',
          stationId: 'BP13',
          pathIndex: 1,
        },
      ],
    });

    expect(options.lineStationPaths.BPLRT).toEqual([['BP1', 'BP6', 'BP13']]);
    expect(
      options.lineDirections.BPLRT?.map((option) => option.stationId),
    ).toEqual(['BP1', 'BP13']);
  });

  it('deduplicates matching line paths and direction terminals across services', () => {
    const options = buildCrowdReportFormOptions({
      referenceDate: '2026-06-17',
      lines: [{ id: 'CCL', name: name('Circle Line'), color: '#fa9e0d' }],
      stations: [
        { id: 'CC1', name: name('Dhoby Ghaut') },
        { id: 'CC29', name: name('HarbourFront') },
      ],
      stationCodes: [],
      services: [
        { id: 'svc-ccl-main', lineId: 'CCL' },
        { id: 'svc-ccl-alt', lineId: 'CCL' },
      ],
      serviceRevisions: [
        {
          id: 'current',
          serviceId: 'svc-ccl-main',
          start_at: '2020-01-01',
          end_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'current',
          serviceId: 'svc-ccl-alt',
          start_at: '2020-01-01',
          end_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      servicePathEntries: [
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-ccl-main',
          stationId: 'CC1',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-ccl-main',
          stationId: 'CC29',
          pathIndex: 1,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-ccl-alt',
          stationId: 'CC1',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-ccl-alt',
          stationId: 'CC29',
          pathIndex: 1,
        },
      ],
    });

    expect(options.lineStationPaths.CCL).toEqual([['CC1', 'CC29']]);
    expect(
      options.lineDirections.CCL?.map((option) => option.stationId),
    ).toEqual(['CC1', 'CC29']);
  });
});
