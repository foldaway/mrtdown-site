import { describe, expect, it } from 'vitest';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionIsActiveOn,
  sortServiceRevisionsByRecency,
} from './serviceRevisions';

const updatedAt = new Date('2026-05-22T00:00:00.000Z');

describe('sortServiceRevisionsByRecency', () => {
  it('keeps active revisions ahead of ended legacy revisions', () => {
    const revisions = [
      {
        id: 'r_legacy_2002_2009',
        end_at: '2010-01-01',
        updated_at: updatedAt,
      },
      {
        id: 'r_2010',
        end_at: null,
        updated_at: updatedAt,
      },
    ];

    expect(
      sortServiceRevisionsByRecency(revisions).map((row) => row.id),
    ).toEqual(['r_2010', 'r_legacy_2002_2009']);
  });

  it('orders ended revisions by the most recent end date', () => {
    const revisions = [
      { id: 'r_2010', end_at: '2010-01-01', updated_at: updatedAt },
      { id: 'r_2020', end_at: '2020-01-01', updated_at: updatedAt },
    ];

    expect(
      sortServiceRevisionsByRecency(revisions).map((row) => row.id),
    ).toEqual(['r_2020', 'r_2010']);
  });

  it('falls back to updated time and id for otherwise equivalent revisions', () => {
    const revisions = [
      {
        id: 'r_a',
        end_at: null,
        updated_at: new Date('2026-05-22T00:00:00.000Z'),
      },
      {
        id: 'r_b',
        end_at: null,
        updated_at: new Date('2026-05-23T00:00:00.000Z'),
      },
    ];

    expect(
      sortServiceRevisionsByRecency(revisions).map((row) => row.id),
    ).toEqual(['r_b', 'r_a']);
  });
});

describe('selectServiceRevisionForReferenceDate', () => {
  it('keeps the current revision active before a future revision starts', () => {
    const revisions = [
      {
        id: 'ccl-current',
        start_at: '2009-05-28',
        end_at: '2026-07-01',
        updated_at: updatedAt,
      },
      {
        id: 'ccl-loop',
        start_at: '2026-07-02',
        end_at: null,
        updated_at: new Date('2026-05-29T00:00:00.000Z'),
      },
    ];

    expect(
      selectServiceRevisionForReferenceDate(revisions, '2026-05-29')?.id,
    ).toBe('ccl-current');
  });

  it('switches to the future revision on its start date', () => {
    const revisions = [
      {
        id: 'ccl-current',
        start_at: '2009-05-28',
        end_at: '2026-07-01',
        updated_at: updatedAt,
      },
      {
        id: 'ccl-loop',
        start_at: '2026-07-02',
        end_at: null,
        updated_at: new Date('2026-05-29T00:00:00.000Z'),
      },
    ];

    expect(
      selectServiceRevisionForReferenceDate(revisions, '2026-07-02')?.id,
    ).toBe('ccl-loop');
  });

  it('treats a future end date as still active', () => {
    expect(
      serviceRevisionIsActiveOn(
        {
          start_at: '2009-05-28',
          end_at: '2026-07-01',
        },
        '2026-05-29',
      ),
    ).toBe(true);
  });

  it('returns the nearest future revision when no service is active yet', () => {
    const revisions = [
      {
        id: 'ccl-extra-future',
        start_at: '2026-07-02',
        end_at: null,
        updated_at: updatedAt,
      },
    ];

    expect(
      selectServiceRevisionForReferenceDate(revisions, '2026-05-29')?.id,
    ).toBe('ccl-extra-future');
  });
});
