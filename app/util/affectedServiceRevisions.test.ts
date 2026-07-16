import { describe, expect, it } from 'vitest';
import {
  type AffectedServiceRevision,
  selectAffectedServiceRevisionForReferenceAt,
} from './affectedServiceRevisions';

const revisions = [
  {
    id: 'current',
    startAt: '2009-05-28',
    endAt: '2026-07-02',
    updatedAt: '2026-05-22T00:00:00.000Z',
    stationIds: ['CC1', 'CC2'],
  },
  {
    id: 'loop',
    startAt: '2026-07-02',
    endAt: null,
    updatedAt: '2026-05-29T00:00:00.000Z',
    stationIds: ['CC1', 'CC2', 'CC3'],
  },
] satisfies AffectedServiceRevision[];

describe('selectAffectedServiceRevisionForReferenceAt', () => {
  it('selects the service path active at the reference timestamp', () => {
    expect(
      selectAffectedServiceRevisionForReferenceAt(
        revisions,
        '2026-07-01T12:00:00+08:00',
      )?.id,
    ).toBe('current');
  });

  it('evaluates timestamps in Singapore time', () => {
    expect(
      selectAffectedServiceRevisionForReferenceAt(
        revisions,
        '2026-07-01T16:30:00Z',
      )?.id,
    ).toBe('loop');
  });
});
