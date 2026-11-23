import { z } from 'zod';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';

// The explicit null is authoritative: an empty archive must not refill via SQL.
const SitemapInputsSchema = z.object({
  lineIds: z.array(z.string()),
  stationIds: z.array(z.string()),
  townIds: z.array(z.string()),
  operatorIds: z.array(z.string()),
  issueIds: z.array(z.string()),
  monthEarliest: z.iso.date(),
  reportEarliestDate: z.iso.date().nullable(),
  monthLatest: z.iso.date(),
});

export const sitemapSnapshotStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'sitemap',
  (value) => SitemapInputsSchema.parse(value),
);

export function isSitemapSnapshotEnabled() {
  return process.env.REDIS_SITEMAP_SNAPSHOT === 'enabled';
}

export function isSitemapSnapshotPublicationEnabled() {
  return (
    isSitemapSnapshotEnabled() ||
    process.env.REDIS_SITEMAP_SNAPSHOT === 'publish'
  );
}
