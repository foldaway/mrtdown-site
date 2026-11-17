import {
  CauseSubtypeSchema,
  EvidenceTypeSchema,
  IssueSchema,
  LandmarkSchema,
  LineSchema,
  OperatorSchema,
  StationSchema,
  TownSchema,
  TranslationsSchema,
} from '@mrtdown/core';
import type { DateTime } from 'luxon';
import { z } from 'zod';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { getDefaultDb } from './dbQueries/database';
import { isoDate } from './dbQueries/dateTime';
import { getIssueReadModel } from './dbQueries/issue';
import { parseNavigationCacheEntry } from './navigationCache.server';
import {
  getNavigationCacheKey,
  getPageProfileRedis,
} from './pageProfileRedis.server';

type IssueProfile = Awaited<ReturnType<typeof getIssueReadModel>>;

const MAX_PROFILE_BYTES = 128 * 1024;
const MAX_CACHEABLE_ID_LENGTH = 256;

const timestamps = z.iso.datetime({ offset: true });
const CompletedIssueSchema = IssueSchema.omit({ titleMeta: true }).extend({
  subtypes: z.array(CauseSubtypeSchema),
  durationSeconds: z.number(),
  lineIds: z.array(z.string()),
  branchesAffected: z.array(
    z.object({
      lineId: z.string(),
      branchId: z.string(),
      serviceName: TranslationsSchema.optional(),
      stationIds: z.array(z.string()),
      wholeServiceRevisions: z
        .array(
          z.object({
            id: z.string(),
            startAt: z.string().nullable(),
            endAt: z.string().nullable(),
            updatedAt: z.string(),
            stationIds: z.array(z.string()),
          }),
        )
        .optional(),
    }),
  ),
  intervals: z
    .array(
      z.object({
        startAt: timestamps,
        endAt: timestamps,
        status: z.literal('ended'),
      }),
    )
    .min(1),
});

const CompletedProfileSchema = z.object({
  data: z.object({
    id: z.string(),
    updates: z.array(
      z.object({
        type: EvidenceTypeSchema,
        text: z.string(),
        textTranslations: TranslationsSchema.nullable(),
        isTextRedacted: z.boolean(),
        sourceUrl: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
  included: z.object({
    issues: z.record(z.string(), CompletedIssueSchema),
    lines: z.record(
      z.string(),
      z.object(LineSchema.shape).omit({ serviceIds: true }),
    ),
    stations: z.record(
      z.string(),
      z
        .object(StationSchema.shape)
        .omit({ stationCodes: true })
        .extend({
          memberships: z.array(
            StationSchema.shape.stationCodes.element.extend({
              endedAt: z.string().optional(),
              branchId: z.string(),
              sequenceOrder: z.number(),
            }),
          ),
        }),
    ),
    towns: z.record(z.string(), TownSchema),
    landmarks: z.record(z.string(), LandmarkSchema),
    operators: z.record(z.string(), OperatorSchema),
  }),
}) satisfies z.ZodType<IssueProfile>;

// Compare and set together so a delayed fill cannot publish after its
// generation stops being active.
const WRITE_CURRENT_GENERATION = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local ok, entry = pcall(cjson.decode, raw)
if not ok or type(entry) ~= 'table' or entry.generation ~= ARGV[1] then return false end
redis.call('SET', KEYS[2], ARGV[2], 'PXAT', ARGV[3])
return 1
`;

type IssueCacheLookup = NonNullable<Awaited<ReturnType<typeof lookupProfile>>>;

const inFlightFills = new Map<string, Promise<IssueProfile>>();

function decodeProfile(raw: string | null, issueId: string) {
  if (raw == null || Buffer.byteLength(raw) > MAX_PROFILE_BYTES) return null;
  try {
    const profile = CompletedProfileSchema.parse(JSON.parse(raw));
    if (
      profile.data.id === issueId &&
      Object.hasOwn(profile.included.issues, issueId) &&
      profile.included.issues[issueId].id === issueId
    ) {
      return profile;
    }
  } catch {
    // A malformed cache value can be replaced from the current SQL snapshot.
  }
  return null;
}

async function lookupProfile(issueId: string, referenceNow: DateTime) {
  if (issueId.length > MAX_CACHEABLE_ID_LENGTH) return null;
  const navigationKey = getNavigationCacheKey();
  const redis = await getPageProfileRedis();
  const observedNavigation = await redis.get(navigationKey);
  const active = parseNavigationCacheEntry(observedNavigation);
  if (active == null) return null;

  // Keep both keys in the same slot so MGET observes them atomically.
  const cacheKey = `{${navigationKey}}:issue:${encodeURIComponent(active.generation)}:${isoDate(referenceNow)}:${encodeURIComponent(issueId)}`;
  const expiresAt = referenceNow.plus({ days: 1 }).startOf('day').toMillis();
  const [currentNavigation, raw] = await redis.mget(navigationKey, cacheKey);
  if (currentNavigation !== observedNavigation) return null;
  const profile = decodeProfile(raw, issueId);
  return {
    navigationKey,
    cacheKey,
    generation: active.generation,
    expiresAt,
    redis,
    profile,
  };
}

async function loadIssueProfile(
  issueId: string,
  referenceNow: DateTime,
  lookup: IssueCacheLookup | null,
) {
  const db = await getDefaultDb();
  const { generation, profile } = await db.transaction(
    async (tx) => {
      const generation =
        lookup && (await readCompletedPageProfileGeneration(tx));
      const profile = await getIssueReadModel(issueId, referenceNow, tx);
      return { generation, profile };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  if (
    lookup == null ||
    generation !== lookup.generation ||
    Date.now() >= lookup.expiresAt
  ) {
    return profile;
  }

  const completed = CompletedProfileSchema.safeParse(profile);
  if (
    !completed.success ||
    !Object.hasOwn(completed.data.included.issues, issueId)
  ) {
    return profile;
  }

  const raw = JSON.stringify(completed.data);
  if (Buffer.byteLength(raw) > MAX_PROFILE_BYTES) return profile;

  await lookup.redis
    .eval(
      WRITE_CURRENT_GENERATION,
      2,
      lookup.navigationKey,
      lookup.cacheKey,
      lookup.generation,
      raw,
      lookup.expiresAt,
    )
    .catch(() => undefined);
  return profile;
}

export async function getCachedIssueProfile(
  issueId: string,
  referenceNow: DateTime,
) {
  const lookup = await lookupProfile(issueId, referenceNow).catch(() => null);
  if (lookup?.profile) {
    return { profile: lookup.profile, expiresAt: lookup.expiresAt };
  }
  if (lookup == null) {
    return { profile: await loadIssueProfile(issueId, referenceNow, null) };
  }

  let fill = inFlightFills.get(lookup.cacheKey);
  if (fill == null) {
    fill = loadIssueProfile(issueId, referenceNow, lookup).finally(() => {
      inFlightFills.delete(lookup.cacheKey);
    });
    inFlightFills.set(lookup.cacheKey, fill);
  }
  return { profile: await fill };
}
