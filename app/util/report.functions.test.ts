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
  it('excludes lines that are not in operation on the reference date', () => {
    const options = buildCrowdReportFormOptions({
      referenceDate: '2026-06-17',
      lines: [
        {
          id: 'CURRENT',
          name: name('Current Line'),
          color: '#005ec4',
          startedAt: '2020-01-01',
          endedAt: null,
        },
        {
          id: 'ENDED',
          name: name('Ended Line'),
          color: '#748477',
          startedAt: '2010-01-01',
          endedAt: '2025-12-31',
        },
        {
          id: 'FUTURE',
          name: name('Future Line'),
          color: '#fa9e0d',
          startedAt: '2027-01-01',
          endedAt: null,
        },
      ],
      stations: [
        { id: 'A', name: name('Alpha') },
        { id: 'B', name: name('Beta') },
        { id: 'C', name: name('Gamma') },
      ],
      stationCodes: [
        { stationId: 'A', lineId: 'CURRENT', code: 'C1' },
        { stationId: 'B', lineId: 'ENDED', code: 'E1' },
        { stationId: 'C', lineId: 'FUTURE', code: 'F1' },
      ],
      services: [
        { id: 'svc-current', lineId: 'CURRENT' },
        { id: 'svc-ended', lineId: 'ENDED' },
        { id: 'svc-future', lineId: 'FUTURE' },
      ],
      serviceRevisions: [
        {
          id: 'current',
          serviceId: 'svc-current',
          start_at: '2020-01-01',
          end_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'ended',
          serviceId: 'svc-ended',
          start_at: '2010-01-01',
          end_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'future',
          serviceId: 'svc-future',
          start_at: '2020-01-01',
          end_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      servicePathEntries: [
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-current',
          stationId: 'A',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'current',
          serviceId: 'svc-current',
          stationId: 'B',
          pathIndex: 1,
        },
        {
          serviceRevisionId: 'ended',
          serviceId: 'svc-ended',
          stationId: 'B',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'ended',
          serviceId: 'svc-ended',
          stationId: 'C',
          pathIndex: 1,
        },
        {
          serviceRevisionId: 'future',
          serviceId: 'svc-future',
          stationId: 'C',
          pathIndex: 0,
        },
        {
          serviceRevisionId: 'future',
          serviceId: 'svc-future',
          stationId: 'A',
          pathIndex: 1,
        },
      ],
    });

    expect(options.lines.map((line) => line.id)).toEqual(['CURRENT']);
    expect(options.stations).toEqual([
      {
        id: 'A',
        name: name('Alpha'),
        codes: ['C1'],
        codePills: [{ lineId: 'CURRENT', code: 'C1' }],
        lineIds: ['CURRENT'],
      },
    ]);
    expect(Object.keys(options.lineDirections)).toEqual(['CURRENT']);
    expect(Object.keys(options.lineStationPaths)).toEqual(['CURRENT']);
  });

  it('excludes station codes that are not active on the reference date', () => {
    const options = buildCrowdReportFormOptions({
      referenceDate: '2026-06-17',
      lines: [
        {
          id: 'ACTIVE',
          name: name('Active Line'),
          color: '#005ec4',
          startedAt: '2020-01-01',
          endedAt: null,
        },
      ],
      stations: [
        { id: 'CURRENT', name: name('Current Station') },
        { id: 'ENDED', name: name('Ended Station') },
        { id: 'FUTURE', name: name('Future Station') },
      ],
      stationCodes: [
        {
          stationId: 'CURRENT',
          lineId: 'ACTIVE',
          code: 'A1',
          startedAt: '2020-01-01',
          endedAt: null,
        },
        {
          stationId: 'ENDED',
          lineId: 'ACTIVE',
          code: 'A2',
          startedAt: '2020-01-01',
          endedAt: '2025-12-31',
        },
        {
          stationId: 'FUTURE',
          lineId: 'ACTIVE',
          code: 'A3',
          startedAt: '2027-01-01',
          endedAt: null,
        },
      ],
      services: [],
      serviceRevisions: [],
      servicePathEntries: [],
    });

    expect(options.stations).toEqual([
      {
        id: 'CURRENT',
        name: name('Current Station'),
        codes: ['A1'],
        codePills: [{ lineId: 'ACTIVE', code: 'A1' }],
        lineIds: ['ACTIVE'],
      },
    ]);
  });

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
