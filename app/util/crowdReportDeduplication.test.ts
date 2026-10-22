import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { findDuplicateCrowdReport } from './crowdReportDeduplication';
import type { CrowdReportSubmission } from './crowdReports';

const SUBMISSION: CrowdReportSubmission = {
  reportScope: 'line',
  observedAt: '2026-10-22T08:20:00+08:00',
  lineIds: ['EWL'],
  stationIds: ['OTP'],
  effect: 'delay',
  directionText: 'towards:PSR',
};

function fakeDb(candidate: Record<string, unknown>) {
  const results = [
    [candidate],
    [{ reportId: candidate.id, lineId: 'EWL' }],
    [{ reportId: candidate.id, stationId: 'BNV' }],
  ];
  const conditions: SQL[] = [];
  const builder = {
    from() {
      return this;
    },
    where(condition: SQL) {
      conditions.push(condition);
      return this;
    },
    orderBy() {
      return this;
    },
    offset() {
      return this;
    },
    limit() {
      return Promise.resolve(results.shift() ?? []);
    },
  };
  return { db: { select: () => builder }, conditions };
}

describe('incident duplicate lookup', () => {
  it('uses recent duplicate observations to extend an existing incident', async () => {
    // The accepted root at 08:00 is outside the window, but its 08:12
    // corroboration is close enough to this 08:20 observation.
    const fake = fakeDb({
      id: 'corroboration',
      duplicateOfId: 'root',
      status: 'duplicate',
      observedAt: '2026-10-22T08:12:00+08:00',
      directionText: null,
      effect: 'delay',
      clusterId: 'incident',
    });
    await expect(
      findDuplicateCrowdReport(fake.db as never, 'new', SUBMISSION, 10),
    ).resolves.toMatchObject({ id: 'root', clusterId: 'incident' });

    const query = new PgDialect().sqlToQuery(fake.conditions[0]);
    expect(query.params).toContain('duplicate');
    expect(query.params).toContain('2026-10-22T00:10:00.000Z');
    expect(query.params).toContain('2026-10-22T00:30:00.000Z');
    expect(query.sql.replace(/\s+/g, ' ')).toContain(
      '"crowd_report_clusters"."dispatched_at" is null',
    );
    // A vague member must not bridge a known opposite direction or effect.
    expect(query.sql).toContain('member.direction_text');
    expect(query.sql.replace(/\s+/g, ' ')).toContain(
      'coalesce(( select "crowd_report_clusters"."effect"',
    );
  });

  it('rejects an unknown member when its cluster has a conflicting known effect', async () => {
    const fake = fakeDb({
      id: 'unknown-member',
      status: 'duplicate',
      clusterId: 'crowding-incident',
      effect: 'crowding',
    });
    await expect(
      findDuplicateCrowdReport(fake.db as never, 'new', SUBMISSION, 10),
    ).resolves.toBeUndefined();
  });

  it('does not use orphaned duplicates as new roots', async () => {
    const fake = fakeDb({ id: 'orphan', status: 'duplicate', clusterId: null });
    await expect(
      findDuplicateCrowdReport(fake.db as never, 'new', SUBMISSION, 10),
    ).resolves.toBeUndefined();
  });
});
