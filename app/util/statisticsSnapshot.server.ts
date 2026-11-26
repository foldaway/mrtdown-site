import { z } from 'zod';
import {
  assertCompleteStatisticsSnapshot,
  parseStatisticsSnapshotPayload,
} from './dbQueries/statisticsSnapshotInputs';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';

const EnvelopeSchema = z.object({
  kind: z.literal('statistics_inputs.v1'),
  asOf: z.iso.datetime({ offset: true }),
  data: z.unknown(),
  included: z.unknown(),
});

export function parseStatisticsInputs(value: unknown) {
  const envelope = EnvelopeSchema.parse(value);
  const snapshot = parseStatisticsSnapshotPayload({
    kind: 'statistics_snapshot.v1',
    data: envelope.data,
    included: envelope.included,
  });
  assertCompleteStatisticsSnapshot(snapshot);
  return { kind: envelope.kind, asOf: envelope.asOf, ...snapshot };
}

export const statisticsSnapshotStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'statistics',
  parseStatisticsInputs,
);
