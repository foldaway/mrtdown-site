import {
  type IngestContentCrowdReportEffect,
  IngestContentCrowdReportEffectSchema,
} from '@mrtdown/ingest-contracts';
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  crowdReportAbuseEventsTable,
  crowdReportClusterLinesTable,
  crowdReportClustersTable,
  crowdReportClusterStationsTable,
  crowdReportLinesTable,
  crowdReportModerationEventsTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  linesTable,
  stationsTable,
  crowdReportStationsTable,
} from '~/db/schema';
import { buildCrowdReportDispatchLockKey } from './crowdReportLocks';

const SG_TIMEZONE = 'Asia/Singapore';
const DEFAULT_RATE_LIMIT_PER_HOUR = 5;
const MAX_REPORT_AGE_HOURS = 24;
const MAX_REPORT_FUTURE_MINUTES = 15;
const DEFAULT_DUPLICATE_WINDOW_MINUTES = 10;
const DEFAULT_CLUSTER_WINDOW_MINUTES = 10;
const DEFAULT_PUBLIC_SIGNAL_MIN_REPORTS = 3;
const DEFAULT_PUBLIC_SIGNAL_MIN_DISTINCT_IP_HASHES = 2;
const DEFAULT_PUBLIC_SIGNAL_MAX_AGE_MINUTES = 90;
const DEFAULT_PUBLIC_SIGNAL_LIMIT = 20;
const AUTO_REJECT_RESOLVED_STALE_HOURS = 6;
const AUTO_REJECT_UNCONFIRMED_STALE_HOURS = 12;
const DUPLICATE_CANDIDATE_PAGE_SIZE = 100;
export const MAX_CROWD_REPORT_REQUEST_BYTES = 10_000;

export const CrowdReportEffectSchema = IngestContentCrowdReportEffectSchema;

const optionalTrimmedString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const RawCrowdReportSubmissionSchema = z
  .object({
    observedAt: optionalTrimmedString(64),
    lineIds: z.array(z.string().trim().min(1).max(64)).max(8).default([]),
    stationIds: z.array(z.string().trim().min(1).max(64)).max(16).default([]),
    text: z.string().trim().min(8).max(1000),
    directionText: optionalTrimmedString(120),
    effect: CrowdReportEffectSchema.optional(),
    delayMinutes: z.number().int().min(0).max(180).optional(),
    isStillHappening: z.boolean().optional(),
    turnstileToken: optionalTrimmedString(4096),
    clientFingerprint: optionalTrimmedString(512),
  })
  .strict();

export type CrowdReportEffect = IngestContentCrowdReportEffect;

export type CrowdReportSubmission = {
  observedAt: string;
  lineIds: string[];
  stationIds: string[];
  text: string;
  directionText?: string;
  effect?: CrowdReportEffect;
  delayMinutes?: number;
  isStillHappening?: boolean;
  turnstileToken?: string;
  clientFingerprint?: string;
};

export type CrowdReportValidationResult =
  | { success: true; data: CrowdReportSubmission }
  | { success: false; issues: string[] };

export class CrowdReportRateLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly bucketStartAt: string,
  ) {
    super('Crowd report rate limit exceeded');
  }
}

export type CrowdReportJsonBodyResult =
  | { success: true; body: unknown }
  | { success: false; status: 400 | 413; error: string };

type AppDb = ReturnType<typeof import('~/db').getDb>;
type CrowdReportTransaction = Parameters<
  Parameters<AppDb['transaction']>[0]
>[0];
type CrowdReportReadableDb = Pick<CrowdReportTransaction, 'select'>;

type PersistCrowdReportOptions = {
  now?: DateTime;
  rateLimitPerHour?: number;
  idFactory?: () => string;
};

type PersistCrowdReportTransactionContext = {
  rateLimitPerHour: number;
  idFactory: () => string;
  bucketStartAt: string;
  reportId: string;
};

type AutomoderateCrowdReportOptions = ClusterCrowdReportOptions & {
  duplicateWindowMinutes?: number;
  now?: DateTime;
};

type ClusterCrowdReportOptions = {
  clusterWindowMinutes?: number;
  publicSignalMinReports?: number;
  publicSignalMinDistinctIpHashes?: number;
  idFactory?: () => string;
};

type DuplicateCrowdReport = {
  id: string;
  clusterId: string | null;
  observedAt: string;
};

type CrowdReportAutomationPolicyResult =
  | { action: 'accept' }
  | { action: 'reject'; reason: string };

export type PublicCrowdReportSignal = {
  id: string;
  effect: CrowdReportEffect | null;
  reportCount: number;
  lineIds: string[];
  stationIds: string[];
  windowStartAt: string;
  windowEndAt: string;
  updatedAt: string;
};

export type CrowdReportAbuseContext = {
  ipHash: string;
  userAgentHash?: string;
  clientFingerprintHash?: string;
  turnstileTokenHash?: string;
  turnstileOutcome: string;
};

export type TurnstileVerificationOptions = {
  expectedHostname?: string;
  expectedAction?: string;
};

export type TurnstileVerificationResult =
  | { success: true; outcome: 'skipped' | 'passed' }
  | { success: false; outcome: 'missing_token' | 'failed'; error: string };

function normalizeComparableText(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function normalizeIdSet(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function areSameIdSets(left: string[], right: string[]) {
  const normalizedLeft = normalizeIdSet(left);
  const normalizedRight = normalizeIdSet(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function buildDuplicateLockKey(submission: CrowdReportSubmission) {
  return JSON.stringify({
    effect: submission.effect ?? null,
    directionText: normalizeComparableText(submission.directionText),
    lineIds: normalizeIdSet(submission.lineIds),
    stationIds: normalizeIdSet(submission.stationIds),
  });
}

async function lockCrowdReportClusterDispatchInTransaction(
  tx: Pick<CrowdReportTransaction, 'execute'>,
  clusterId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${buildCrowdReportDispatchLockKey('cluster', clusterId)}, 0::bigint))`,
  );
}

async function lockCrowdReportDispatchInTransaction(
  tx: Pick<CrowdReportTransaction, 'execute'>,
  reportId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${buildCrowdReportDispatchLockKey('report', reportId)}, 0::bigint))`,
  );
}

async function isCrowdReportClusterAvailableForDuplicateInTransaction(
  tx: Pick<CrowdReportTransaction, 'select'>,
  clusterId: string,
) {
  const rows = await tx
    .select({ id: crowdReportClustersTable.id })
    .from(crowdReportClustersTable)
    .where(
      and(
        eq(crowdReportClustersTable.id, clusterId),
        inArray(crowdReportClustersTable.status, ['pending', 'accepted']),
        isNull(crowdReportClustersTable.dispatched_at),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function isLegacyCrowdReportAvailableForDuplicateInTransaction(
  tx: Pick<CrowdReportTransaction, 'select'>,
  reportId: string,
) {
  const rows = await tx
    .select({ id: crowdReportsTable.id })
    .from(crowdReportsTable)
    .where(
      and(
        eq(crowdReportsTable.id, reportId),
        eq(crowdReportsTable.status, 'accepted'),
        isNull(crowdReportsTable.cluster_id),
        isNull(crowdReportsTable.dispatched_at),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

function getCrowdReportClusterWindow(
  observedAtIso: string,
  clusterWindowMinutes: number,
) {
  const observedAt = DateTime.fromISO(observedAtIso, {
    setZone: true,
  }).toUTC();
  const windowStartAt = observedAt
    .minus({ minutes: clusterWindowMinutes })
    .toISO();
  const windowEndAt = observedAt
    .plus({ minutes: clusterWindowMinutes })
    .toISO();
  if (windowStartAt == null || windowEndAt == null) {
    throw new Error('Unable to calculate crowd report cluster window');
  }
  return { windowStartAt, windowEndAt };
}

function getCrowdReportClusterOngoingReportCountSql(
  clusterId: string | typeof crowdReportClustersTable.id,
) {
  return sql<number>`(
    select count(*)::int
    from ${crowdReportsTable}
    where ${crowdReportsTable.cluster_id} = ${clusterId}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  )`;
}

function getCrowdReportClusterOngoingDistinctIpHashCountSql(
  clusterId: string | typeof crowdReportClustersTable.id,
) {
  return sql<number>`(
    select count(distinct ${crowdReportAbuseEventsTable.ip_hash})::int
    from ${crowdReportAbuseEventsTable}
    inner join ${crowdReportsTable}
      on ${crowdReportsTable.id} = ${crowdReportAbuseEventsTable.report_id}
    where ${crowdReportsTable.cluster_id} = ${clusterId}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  )`;
}

function getCrowdReportClusterOngoingWindowStartAtSql(
  clusterId: string | typeof crowdReportClustersTable.id,
) {
  return sql<string>`(
    select min(${crowdReportsTable.observed_at})
    from ${crowdReportsTable}
    where ${crowdReportsTable.cluster_id} = ${clusterId}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  )`;
}

function getCrowdReportClusterOngoingWindowEndAtSql(
  clusterId: string | typeof crowdReportClustersTable.id,
) {
  return sql<string>`(
    select max(${crowdReportsTable.observed_at})
    from ${crowdReportsTable}
    where ${crowdReportsTable.cluster_id} = ${clusterId}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  )`;
}

function hasCrowdReportClusterCurrentConfidenceSql(
  minReportCount: number,
  minDistinctIpHashes: number,
) {
  return sql`${getCrowdReportClusterOngoingReportCountSql(
    crowdReportClustersTable.id,
  )} >= ${minReportCount} and ${getCrowdReportClusterOngoingDistinctIpHashCountSql(
    crowdReportClustersTable.id,
  )} >= ${minDistinctIpHashes}`;
}

function hasCrowdReportClusterScopeSql() {
  return sql`(
    exists (
      select 1
      from ${crowdReportClusterLinesTable}
      where ${crowdReportClusterLinesTable.cluster_id} = ${crowdReportClustersTable.id}
    )
    or exists (
      select 1
      from ${crowdReportClusterStationsTable}
      where ${crowdReportClusterStationsTable.cluster_id} = ${crowdReportClustersTable.id}
    )
  )`;
}

function normalizePolicyText(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\p{Cf}/gu, '')
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/\s+/g, ' ');
}

function isRepeatedFillerText(value: string) {
  const compact = value.replace(/[\s\p{P}\p{S}]/gu, '');
  if (!/[\p{L}\p{N}]/u.test(value) || /^\p{N}+$/u.test(compact)) {
    return true;
  }

  if (compact.length >= 8 && new Set([...compact]).size <= 2) {
    return true;
  }

  const tokens = value.split(' ').filter(Boolean);
  return tokens.length >= 3 && new Set(tokens).size === 1;
}

function isObviousTestReportText(value: string) {
  return (
    [
      'asdf',
      'hello',
      'hi',
      'lorem ipsum',
      'n/a',
      'na',
      'none',
      'nothing',
      'qwerty',
      'test',
      'test report',
      'testing',
    ].includes(value) || /^test(?:ing)?(?:\s+\d+)?$/.test(value)
  );
}

function isObviousSpamOrSolicitationText(value: string) {
  if (
    /(?:https?:\/\/|www\.)\S+/u.test(value) ||
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/u.test(value)
  ) {
    return true;
  }

  if (
    /\b(?:buy now|casino|crypto|forex|free money|loan|promo code|seo|work from home)\b/u.test(
      value,
    )
  ) {
    return true;
  }

  return (
    /\b(?:call|sms|telegram|text|whatsapp)\b/u.test(value) &&
    /(?:\+?\d[\s-]?){8,}/u.test(value)
  );
}

function isObviousNonTransitChatterText(value: string) {
  if (
    [
      'good afternoon',
      'good evening',
      'good morning',
      'good night',
      'how are you',
      'i am bored',
      'weather today',
      'what is the weather',
      'where to eat',
    ].includes(value)
  ) {
    return true;
  }

  return /\b(?:food delivery|homework help|movie tickets|taxi booking)\b/u.test(
    value,
  );
}

function isObviousPromptInjectionText(value: string) {
  return (
    /\b(?:ignore|disregard|forget)\s+(?:(?:all|the|your)\s+)?(?:(?:previous|prior|above)\s+(?:(?:system|developer)\s+)?(?:instructions?|prompts?|messages?|rules?)|(?:system|developer)\s+(?:instructions?|prompts?|messages?|rules?)|(?:prompts?|rules?))\b/u.test(
      value,
    ) ||
    /\b(?:reveal|print|show)\s+(?:(?:the|your)\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)\b/u.test(
      value,
    ) ||
    /\b(?:act\s+as|pretend\s+(?:as|to\s+be))\s+(?:(?:a|an|the)\s+)?(?:[a-z]+\s+){0,2}(?:admin|assistant|developer|moderator|operator|(?:data\s+)?reviewer|system|triage)\b/u.test(
      value,
    ) ||
    /\b(?:you(?:\s+are|'re)\s+(?:now\s+)?|from\s+now\s+on,?\s+you(?:\s+are|'re)\s+)(?:(?:a|an|the)\s+)?(?:[a-z]+\s+){0,2}(?:admin|assistant|developer|moderator|operator|(?:data\s+)?reviewer|system|triage)\b/u.test(
      value,
    ) ||
    /\b(?:(?:new|updated|additional)\s+)?(?:system|developer)\s+(?:instructions?|messages?|prompts?|rules?)\s*:\s*(?:(?:always|please)\s+)?(?:accept|create|mark|reject|treat)\b/u.test(
      value,
    ) ||
    /\b(?:(?:new|updated|additional)\s+system\s+(?:instructions?|prompts?|rules?)|(?:new|updated|additional)\s+developer\s+(?:instructions?|messages?|prompts?|rules?)|override\s+(?:(?:the|your)\s+)?(?:system|developer)\s+(?:instructions?|messages?|prompts?|rules?))\b/u.test(
      value,
    ) ||
    /\b(?:do not|don't|never)\s+(?:follow|obey)\s+(?:(?:the|your)\s+)?(?:(?:above|previous|prior)\s+(?:system|developer)\s+|(?:system|developer)\s+)(?:instructions?|messages?|prompts?|rules?)\b/u.test(
      value,
    ) ||
    /\b(?:do not|don't|never)\s+(?:follow|obey)\s+(?:(?:the|your)\s+)?above\s+(?:instructions?|messages?|prompts?|rules?)\b/u.test(
      value,
    ) ||
    /\b(?:do not|don't|never)\s+(?:follow|obey)\s+(?:(?:the|your)\s+)?(?:previous|prior)\s+(?:instructions?|messages?|prompts?|rules?)(?:(?:\s+(?:and\s+)?)|[.;:]\s*)(?:accept|create|mark|reject|treat)\b/u.test(
      value,
    ) ||
    /\b(?:treat|use)\s+(?:this|the following)\s+as\s+(?:(?:a|an|the)\s+)?(?:developer|system)\s+(?:instructions?|messages?|prompts?|rules?)\b/u.test(
      value,
    ) ||
    /\b(?:enable|(?:enter|switch)(?:\s+(?:to|into))?|activate|turn\s+on)\s+(?:(?:the|your)\s+)?(?:admin|developer|debug|system)\s+mode\b/u.test(
      value,
    ) ||
    /\b(?:admin|developer|debug|system)\s+mode\s*:\s*(?:(?:always|please)\s+)?(?:accept|create|ignore|mark|override|reject|treat)\b/u.test(
      value,
    ) ||
    /\b(?:admin|debug|developer|system)\s+override\s*:\s*(?:(?:always|please)\s+)?(?:accept|create|ignore|mark|reject|treat)\b/u.test(
      value,
    ) ||
    /\b(?:bypass|override)\s+(?:(?:the|your|all|automated|content|ai|llm|model)\s+)*(?:filters?|moderation|(?:ai|llm|model)\s+safety|(?:ai|llm|model|moderation)\s+guardrails?|triage)\b/u.test(
      value,
    ) ||
    /\b(?:bypass|override)\s+(?:(?:the|your|all|automated)\s+)*(?:(?:ai|llm|model|moderation|input|report|submission)\s+validation)\b/u.test(
      value,
    ) ||
    /\b(?:jailbreak|prompt injection)\b/u.test(value)
  );
}

export function assessCrowdReportAutomationPolicy(
  submission: CrowdReportSubmission,
  now = DateTime.now().setZone(SG_TIMEZONE),
): CrowdReportAutomationPolicyResult {
  const normalizedText = normalizePolicyText(submission.text);
  if (
    isObviousTestReportText(normalizedText) ||
    isRepeatedFillerText(normalizedText)
  ) {
    return {
      action: 'reject',
      reason:
        'Report rejected by automated moderation: obvious test or filler text',
    };
  }

  if (isObviousSpamOrSolicitationText(normalizedText)) {
    return {
      action: 'reject',
      reason:
        'Report rejected by automated moderation: spam or solicitation text',
    };
  }

  if (isObviousNonTransitChatterText(normalizedText)) {
    return {
      action: 'reject',
      reason:
        'Report rejected by automated moderation: obvious non-transit text',
    };
  }

  const normalizedDirectionText = normalizePolicyText(
    submission.directionText ?? '',
  );
  if (
    [normalizedText, normalizedDirectionText].some((value) =>
      isObviousPromptInjectionText(value),
    )
  ) {
    return {
      action: 'reject',
      reason: 'Report rejected by automated moderation: prompt-injection text',
    };
  }

  const observedAt = DateTime.fromISO(submission.observedAt, {
    setZone: true,
  });
  if (
    submission.isStillHappening === false &&
    observedAt.isValid &&
    observedAt.setZone(SG_TIMEZONE) <
      now.minus({ hours: AUTO_REJECT_RESOLVED_STALE_HOURS })
  ) {
    return {
      action: 'reject',
      reason: `Report rejected by automated moderation: resolved report is more than ${AUTO_REJECT_RESOLVED_STALE_HOURS}h old`,
    };
  }

  if (
    submission.isStillHappening == null &&
    observedAt.isValid &&
    observedAt.setZone(SG_TIMEZONE) <
      now.minus({ hours: AUTO_REJECT_UNCONFIRMED_STALE_HOURS })
  ) {
    return {
      action: 'reject',
      reason: `Report rejected by automated moderation: unconfirmed report is more than ${AUTO_REJECT_UNCONFIRMED_STALE_HOURS}h old`,
    };
  }

  return { action: 'accept' };
}

export function validateCrowdReportSubmission(
  input: unknown,
  now = DateTime.now().setZone(SG_TIMEZONE),
): CrowdReportValidationResult {
  const parsed = RawCrowdReportSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const lineIds = [...new Set(parsed.data.lineIds)];
  const stationIds = [...new Set(parsed.data.stationIds)];
  const issues: string[] = [];
  if (lineIds.length === 0 && stationIds.length === 0) {
    issues.push('At least one affected line or station is required');
  }

  const observedAt = parsed.data.observedAt
    ? DateTime.fromISO(parsed.data.observedAt, { setZone: true })
    : now;

  if (!observedAt.isValid) {
    issues.push('observedAt must be a valid ISO datetime');
  } else {
    const observedAtSg = observedAt.setZone(SG_TIMEZONE);
    if (observedAtSg < now.minus({ hours: MAX_REPORT_AGE_HOURS })) {
      issues.push(
        `observedAt cannot be more than ${MAX_REPORT_AGE_HOURS}h old`,
      );
    }
    if (observedAtSg > now.plus({ minutes: MAX_REPORT_FUTURE_MINUTES })) {
      issues.push(
        `observedAt cannot be more than ${MAX_REPORT_FUTURE_MINUTES}m in the future`,
      );
    }
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  const observedAtIso = observedAt.setZone(SG_TIMEZONE).toISO();
  if (observedAtIso == null) {
    return { success: false, issues: ['observedAt must be valid'] };
  }

  return {
    success: true,
    data: {
      observedAt: observedAtIso,
      lineIds,
      stationIds,
      text: parsed.data.text,
      directionText: parsed.data.directionText,
      effect: parsed.data.effect,
      delayMinutes: parsed.data.delayMinutes,
      isStillHappening: parsed.data.isStillHappening,
      turnstileToken: parsed.data.turnstileToken,
      clientFingerprint: parsed.data.clientFingerprint,
    },
  };
}

export function getCrowdReportRateLimitBucketStart(
  now = DateTime.now().setZone(SG_TIMEZONE),
) {
  const value = now.setZone(SG_TIMEZONE).startOf('hour').toISO();
  if (value == null) {
    throw new Error('Unable to calculate crowd report rate-limit bucket');
  }
  return value;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    forwardedFor?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function parseCrowdReportJsonBody(
  request: Request,
  maxBytes = MAX_CROWD_REPORT_REQUEST_BYTES,
): Promise<CrowdReportJsonBodyResult> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return {
      success: false,
      status: 413,
      error: 'Request body is too large',
    };
  }

  if (!request.body) {
    return {
      success: false,
      status: 400,
      error: 'Request body must be valid JSON',
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        return {
          success: false,
          status: 413,
          error: 'Request body is too large',
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      success: false,
      status: 400,
      error: 'Request body must be valid JSON',
    };
  }

  const bodyBytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      success: true,
      body: JSON.parse(new TextDecoder().decode(bodyBytes)),
    };
  } catch {
    return {
      success: false,
      status: 400,
      error: 'Request body must be valid JSON',
    };
  }
}

export async function hashCrowdReportValue(value: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildCrowdReportAbuseContext(
  request: Request,
  submission: Pick<
    CrowdReportSubmission,
    'clientFingerprint' | 'turnstileToken'
  >,
  salt: string,
  turnstileOutcome: string,
): Promise<CrowdReportAbuseContext> {
  const userAgent = request.headers.get('user-agent');
  return {
    ipHash: await hashCrowdReportValue(getClientIp(request), salt),
    userAgentHash: userAgent
      ? await hashCrowdReportValue(userAgent, salt)
      : undefined,
    clientFingerprintHash: submission.clientFingerprint
      ? await hashCrowdReportValue(submission.clientFingerprint, salt)
      : undefined,
    turnstileTokenHash: submission.turnstileToken
      ? await hashCrowdReportValue(submission.turnstileToken, salt)
      : undefined,
    turnstileOutcome,
  };
}

export async function verifyTurnstileToken(
  secret: string | undefined,
  token: string | undefined,
  remoteIp: string | undefined,
  options: TurnstileVerificationOptions = {},
): Promise<TurnstileVerificationResult> {
  if (!secret) {
    return { success: true, outcome: 'skipped' };
  }
  if (!token) {
    return {
      success: false,
      outcome: 'missing_token',
      error: 'Turnstile token is required',
    };
  }

  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp && remoteIp !== 'unknown') {
    body.set('remoteip', remoteIp);
  }

  let response: Response;
  try {
    response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body,
      },
    );
  } catch {
    return {
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification request failed',
    };
  }
  if (!response.ok) {
    return {
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification request failed',
    };
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return {
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification failed',
    };
  }

  const result = z
    .object({
      success: z.boolean(),
      hostname: z.string().optional(),
      action: z.string().optional(),
      'error-codes': z.array(z.string()).optional(),
    })
    .safeParse(responseBody);

  if (!result.success || !result.data.success) {
    return {
      success: false,
      outcome: 'failed',
      error:
        result.success && result.data['error-codes']?.length
          ? result.data['error-codes'].join(', ')
          : 'Turnstile verification failed',
    };
  }

  if (
    options.expectedHostname &&
    result.data.hostname !== options.expectedHostname
  ) {
    return {
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification hostname mismatch',
    };
  }

  if (options.expectedAction && result.data.action !== options.expectedAction) {
    return {
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification action mismatch',
    };
  }

  return { success: true, outcome: 'passed' };
}

export async function findMissingCrowdReportReferences(
  db: AppDb,
  submission: Pick<CrowdReportSubmission, 'lineIds' | 'stationIds'>,
) {
  const [lineRows, stationRows] = await Promise.all([
    submission.lineIds.length > 0
      ? db
          .select({ id: linesTable.id })
          .from(linesTable)
          .where(inArray(linesTable.id, submission.lineIds))
      : Promise.resolve([]),
    submission.stationIds.length > 0
      ? db
          .select({ id: stationsTable.id })
          .from(stationsTable)
          .where(inArray(stationsTable.id, submission.stationIds))
      : Promise.resolve([]),
  ]);

  const existingLineIds = new Set(lineRows.map((row) => row.id));
  const existingStationIds = new Set(stationRows.map((row) => row.id));

  return {
    lineIds: submission.lineIds.filter((id) => !existingLineIds.has(id)),
    stationIds: submission.stationIds.filter(
      (id) => !existingStationIds.has(id),
    ),
  };
}

async function findDuplicateCrowdReport(
  db: CrowdReportReadableDb,
  reportId: string,
  submission: CrowdReportSubmission,
  duplicateWindowMinutes: number,
) {
  const observedAt = DateTime.fromISO(submission.observedAt, {
    setZone: true,
  });
  const windowStartAt = observedAt
    .minus({ minutes: duplicateWindowMinutes })
    .toUTC()
    .toISO();
  const windowEndAt = observedAt
    .plus({ minutes: duplicateWindowMinutes })
    .toUTC()
    .toISO();
  if (windowStartAt == null || windowEndAt == null) {
    return undefined;
  }

  let offset = 0;
  while (true) {
    const candidates = await db
      .select({
        id: crowdReportsTable.id,
        observedAt: crowdReportsTable.observed_at,
        status: crowdReportsTable.status,
        directionText: crowdReportsTable.direction_text,
        clusterId: crowdReportsTable.cluster_id,
      })
      .from(crowdReportsTable)
      .where(
        and(
          ne(crowdReportsTable.id, reportId),
          submission.effect == null
            ? isNull(crowdReportsTable.effect)
            : eq(crowdReportsTable.effect, submission.effect),
          eq(crowdReportsTable.status, 'accepted'),
          gte(crowdReportsTable.observed_at, windowStartAt),
          lte(crowdReportsTable.observed_at, windowEndAt),
        ),
      )
      .orderBy(desc(crowdReportsTable.created_at))
      .offset(offset)
      .limit(DUPLICATE_CANDIDATE_PAGE_SIZE);

    const candidateIds = candidates.map((candidate) => candidate.id);
    if (candidateIds.length === 0) {
      return undefined;
    }

    const [candidateLines, candidateStations] = await Promise.all([
      db
        .select({
          reportId: crowdReportLinesTable.report_id,
          lineId: crowdReportLinesTable.line_id,
        })
        .from(crowdReportLinesTable)
        .where(inArray(crowdReportLinesTable.report_id, candidateIds))
        .limit(DUPLICATE_CANDIDATE_PAGE_SIZE * 8),
      db
        .select({
          reportId: crowdReportStationsTable.report_id,
          stationId: crowdReportStationsTable.station_id,
        })
        .from(crowdReportStationsTable)
        .where(inArray(crowdReportStationsTable.report_id, candidateIds))
        .limit(DUPLICATE_CANDIDATE_PAGE_SIZE * 16),
    ]);

    for (const candidate of candidates) {
      if (candidate.status !== 'accepted') {
        continue;
      }
      if (
        normalizeComparableText(candidate.directionText) !==
        normalizeComparableText(submission.directionText)
      ) {
        continue;
      }

      const lineIds = candidateLines
        .filter((line) => line.reportId === candidate.id)
        .map((line) => line.lineId);
      const stationIds = candidateStations
        .filter((station) => station.reportId === candidate.id)
        .map((station) => station.stationId);

      if (
        areSameIdSets(lineIds, submission.lineIds) &&
        areSameIdSets(stationIds, submission.stationIds)
      ) {
        return candidate;
      }
    }

    if (candidates.length < DUPLICATE_CANDIDATE_PAGE_SIZE) {
      return undefined;
    }
    offset += DUPLICATE_CANDIDATE_PAGE_SIZE;
  }
}

export async function automoderateCrowdReport(
  db: AppDb,
  reportId: string,
  submission: CrowdReportSubmission,
  options: AutomoderateCrowdReportOptions = {},
) {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const duplicateWindowMinutes =
    options.duplicateWindowMinutes ?? DEFAULT_DUPLICATE_WINDOW_MINUTES;
  const now = options.now ?? DateTime.now().setZone(SG_TIMEZONE);

  return db.transaction((tx) =>
    automoderateCrowdReportInTransaction(
      tx,
      reportId,
      submission,
      duplicateWindowMinutes,
      idFactory,
      now,
      options.clusterWindowMinutes,
      options.publicSignalMinReports,
      options.publicSignalMinDistinctIpHashes,
    ),
  );
}

async function automoderateCrowdReportInTransaction(
  tx: CrowdReportTransaction,
  reportId: string,
  submission: CrowdReportSubmission,
  duplicateWindowMinutes: number,
  idFactory: () => string,
  now: DateTime,
  clusterWindowMinutes = DEFAULT_CLUSTER_WINDOW_MINUTES,
  publicSignalMinReports = DEFAULT_PUBLIC_SIGNAL_MIN_REPORTS,
  publicSignalMinDistinctIpHashes = DEFAULT_PUBLIC_SIGNAL_MIN_DISTINCT_IP_HASHES,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${buildDuplicateLockKey(submission)}, 0::bigint))`,
  );

  const policy = assessCrowdReportAutomationPolicy(submission, now);
  if (policy.action === 'reject') {
    const [updatedReport] = await tx
      .update(crowdReportsTable)
      .set({
        status: 'rejected',
        duplicate_of_id: null,
        updated_at: sql`now()`,
      })
      .where(eq(crowdReportsTable.id, reportId))
      .returning({
        id: crowdReportsTable.id,
        status: crowdReportsTable.status,
        duplicateOfId: crowdReportsTable.duplicate_of_id,
      });

    await tx.insert(crowdReportModerationEventsTable).values({
      id: idFactory(),
      report_id: reportId,
      actor: 'system',
      action: 'automated_rejected',
      note: policy.reason,
    });

    return (
      updatedReport ?? {
        id: reportId,
        status: 'rejected' as const,
        duplicateOfId: null,
      }
    );
  }

  let duplicate = await findDuplicateCrowdReport(
    tx,
    reportId,
    submission,
    duplicateWindowMinutes,
  );
  if (duplicate?.clusterId != null) {
    await lockCrowdReportClusterDispatchInTransaction(tx, duplicate.clusterId);
    if (
      !(await isCrowdReportClusterAvailableForDuplicateInTransaction(
        tx,
        duplicate.clusterId,
      ))
    ) {
      duplicate = undefined;
    }
  } else if (duplicate != null) {
    await lockCrowdReportDispatchInTransaction(tx, duplicate.id);
    if (
      !(await isLegacyCrowdReportAvailableForDuplicateInTransaction(
        tx,
        duplicate.id,
      ))
    ) {
      duplicate = undefined;
    }
  }
  const status = duplicate == null ? 'accepted' : 'duplicate';

  const [updatedReport] = await tx
    .update(crowdReportsTable)
    .set({
      status,
      duplicate_of_id: duplicate?.id ?? null,
      updated_at: sql`now()`,
    })
    .where(eq(crowdReportsTable.id, reportId))
    .returning({
      id: crowdReportsTable.id,
      status: crowdReportsTable.status,
      duplicateOfId: crowdReportsTable.duplicate_of_id,
    });

  await tx.insert(crowdReportModerationEventsTable).values({
    id: idFactory(),
    report_id: reportId,
    actor: 'system',
    action: duplicate == null ? 'automated_accepted' : 'automated_duplicate',
    note:
      duplicate == null
        ? 'Report accepted by automated moderation rules'
        : `Report automatically marked as duplicate of ${duplicate.id}`,
  });

  await clusterModeratedCrowdReportInTransaction(
    tx,
    reportId,
    submission,
    duplicate,
    clusterWindowMinutes,
    publicSignalMinReports,
    publicSignalMinDistinctIpHashes,
    idFactory,
  );

  return (
    updatedReport ?? {
      id: reportId,
      status,
      duplicateOfId: duplicate?.id ?? null,
    }
  );
}

async function createCrowdReportClusterInTransaction(
  tx: CrowdReportTransaction,
  reportId: string,
  submission: CrowdReportSubmission,
  clusterWindowMinutes: number,
  idFactory: () => string,
  publicSignalMinReports: number,
  publicSignalMinDistinctIpHashes: number,
) {
  const clusterId = idFactory();
  const { windowStartAt, windowEndAt } = getCrowdReportClusterWindow(
    submission.observedAt,
    clusterWindowMinutes,
  );

  await tx.insert(crowdReportClustersTable).values({
    id: clusterId,
    effect: submission.effect,
    window_start_at: windowStartAt,
    window_end_at: windowEndAt,
    report_count: 1,
    status:
      submission.isStillHappening === true &&
      publicSignalMinReports <= 1 &&
      publicSignalMinDistinctIpHashes <= 1
        ? 'accepted'
        : 'pending',
  });

  if (submission.lineIds.length > 0) {
    await tx.insert(crowdReportClusterLinesTable).values(
      submission.lineIds.map((lineId) => ({
        cluster_id: clusterId,
        line_id: lineId,
      })),
    );
  }

  if (submission.stationIds.length > 0) {
    await tx.insert(crowdReportClusterStationsTable).values(
      submission.stationIds.map((stationId) => ({
        cluster_id: clusterId,
        station_id: stationId,
      })),
    );
  }

  await tx
    .update(crowdReportsTable)
    .set({
      cluster_id: clusterId,
      updated_at: sql`now()`,
    })
    .where(eq(crowdReportsTable.id, reportId))
    .returning({ id: crowdReportsTable.id });

  return clusterId;
}

async function clusterModeratedCrowdReportInTransaction(
  tx: CrowdReportTransaction,
  reportId: string,
  submission: CrowdReportSubmission,
  duplicate: DuplicateCrowdReport | undefined,
  clusterWindowMinutes: number,
  publicSignalMinReports: number,
  publicSignalMinDistinctIpHashes: number,
  idFactory: () => string,
) {
  if (duplicate == null) {
    await createCrowdReportClusterInTransaction(
      tx,
      reportId,
      submission,
      clusterWindowMinutes,
      idFactory,
      publicSignalMinReports,
      publicSignalMinDistinctIpHashes,
    );
    return;
  }

  const clusterId =
    duplicate.clusterId ??
    (await createCrowdReportClusterInTransaction(
      tx,
      duplicate.id,
      { ...submission, observedAt: duplicate.observedAt },
      clusterWindowMinutes,
      idFactory,
      publicSignalMinReports,
      publicSignalMinDistinctIpHashes,
    ));
  const { windowStartAt, windowEndAt } = getCrowdReportClusterWindow(
    submission.observedAt,
    clusterWindowMinutes,
  );

  await tx
    .update(crowdReportsTable)
    .set({
      cluster_id: clusterId,
      updated_at: sql`now()`,
    })
    .where(eq(crowdReportsTable.id, reportId))
    .returning({ id: crowdReportsTable.id });

  await tx
    .update(crowdReportClustersTable)
    .set({
      report_count: sql`${crowdReportClustersTable.report_count} + 1`,
      status: sql`case when ${crowdReportClustersTable.status} = 'pending' and ${getCrowdReportClusterOngoingReportCountSql(clusterId)} >= ${publicSignalMinReports} and ${getCrowdReportClusterOngoingDistinctIpHashCountSql(clusterId)} >= ${publicSignalMinDistinctIpHashes} then 'accepted'::crowd_report_cluster_status else ${crowdReportClustersTable.status} end`,
      window_start_at: sql`least(${crowdReportClustersTable.window_start_at}, ${windowStartAt}::timestamptz)`,
      window_end_at: sql`greatest(${crowdReportClustersTable.window_end_at}, ${windowEndAt}::timestamptz)`,
      updated_at: sql`now()`,
    })
    .where(eq(crowdReportClustersTable.id, clusterId))
    .returning({ id: crowdReportClustersTable.id });
}

async function persistCrowdReportInTransaction(
  tx: CrowdReportTransaction,
  submission: CrowdReportSubmission,
  abuseContext: CrowdReportAbuseContext,
  context: PersistCrowdReportTransactionContext,
) {
  const [rateLimit] = await tx
    .insert(crowdReportRateLimitsTable)
    .values({
      ip_hash: abuseContext.ipHash,
      bucket_start_at: context.bucketStartAt,
      submission_count: 1,
      client_fingerprint_hash: abuseContext.clientFingerprintHash,
    })
    .onConflictDoUpdate({
      target: [
        crowdReportRateLimitsTable.ip_hash,
        crowdReportRateLimitsTable.bucket_start_at,
      ],
      set: {
        submission_count: sql`${crowdReportRateLimitsTable.submission_count} + 1`,
        client_fingerprint_hash:
          abuseContext.clientFingerprintHash ??
          crowdReportRateLimitsTable.client_fingerprint_hash,
        updated_at: sql`now()`,
      },
    })
    .returning({
      submissionCount: crowdReportRateLimitsTable.submission_count,
    });

  if ((rateLimit?.submissionCount ?? 0) > context.rateLimitPerHour) {
    throw new CrowdReportRateLimitError(
      context.rateLimitPerHour,
      context.bucketStartAt,
    );
  }

  await tx.insert(crowdReportsTable).values({
    id: context.reportId,
    observed_at: submission.observedAt,
    direction_text: submission.directionText,
    effect: submission.effect,
    delay_minutes: submission.delayMinutes,
    still_happening: submission.isStillHappening,
    text: submission.text,
    status: 'pending',
  });

  if (submission.lineIds.length > 0) {
    await tx.insert(crowdReportLinesTable).values(
      submission.lineIds.map((lineId) => ({
        report_id: context.reportId,
        line_id: lineId,
      })),
    );
  }

  if (submission.stationIds.length > 0) {
    await tx.insert(crowdReportStationsTable).values(
      submission.stationIds.map((stationId) => ({
        report_id: context.reportId,
        station_id: stationId,
      })),
    );
  }

  await tx.insert(crowdReportAbuseEventsTable).values({
    id: context.idFactory(),
    report_id: context.reportId,
    ip_hash: abuseContext.ipHash,
    user_agent_hash: abuseContext.userAgentHash,
    client_fingerprint_hash: abuseContext.clientFingerprintHash,
    turnstile_token_hash: abuseContext.turnstileTokenHash,
    turnstile_outcome: abuseContext.turnstileOutcome,
    rate_limit_bucket_start_at: context.bucketStartAt,
  });

  await tx.insert(crowdReportModerationEventsTable).values({
    id: context.idFactory(),
    report_id: context.reportId,
    actor: 'system',
    action: 'submitted',
    note: 'Report submitted through public API',
  });

  return { id: context.reportId, status: 'pending' as const };
}

export async function persistCrowdReport(
  db: AppDb,
  submission: CrowdReportSubmission,
  abuseContext: CrowdReportAbuseContext,
  options: PersistCrowdReportOptions = {},
) {
  const now = options.now ?? DateTime.now().setZone(SG_TIMEZONE);
  const bucketStartAt = getCrowdReportRateLimitBucketStart(now);
  const limit = options.rateLimitPerHour ?? DEFAULT_RATE_LIMIT_PER_HOUR;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const reportId = idFactory();

  return db.transaction((tx) =>
    persistCrowdReportInTransaction(tx, submission, abuseContext, {
      rateLimitPerHour: limit,
      idFactory,
      bucketStartAt,
      reportId,
    }),
  );
}

export async function persistAutomoderatedCrowdReport(
  db: AppDb,
  submission: CrowdReportSubmission,
  abuseContext: CrowdReportAbuseContext,
  options: PersistCrowdReportOptions & AutomoderateCrowdReportOptions = {},
) {
  const now = options.now ?? DateTime.now().setZone(SG_TIMEZONE);
  const bucketStartAt = getCrowdReportRateLimitBucketStart(now);
  const rateLimitPerHour =
    options.rateLimitPerHour ?? DEFAULT_RATE_LIMIT_PER_HOUR;
  const duplicateWindowMinutes =
    options.duplicateWindowMinutes ?? DEFAULT_DUPLICATE_WINDOW_MINUTES;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const reportId = idFactory();

  return db.transaction(async (tx) => {
    const report = await persistCrowdReportInTransaction(
      tx,
      submission,
      abuseContext,
      {
        rateLimitPerHour,
        idFactory,
        bucketStartAt,
        reportId,
      },
    );

    return automoderateCrowdReportInTransaction(
      tx,
      report.id,
      submission,
      duplicateWindowMinutes,
      idFactory,
      now,
      options.clusterWindowMinutes,
      options.publicSignalMinReports,
      options.publicSignalMinDistinctIpHashes,
    );
  });
}

export async function getPublicCrowdReportSignals(
  db: AppDb,
  options: {
    lineId?: string;
    stationId?: string;
    now?: DateTime;
    maxAgeMinutes?: number;
    minReportCount?: number;
    minDistinctIpHashes?: number;
    limit?: number;
  } = {},
): Promise<PublicCrowdReportSignal[]> {
  const now = options.now ?? DateTime.now().setZone(SG_TIMEZONE);
  const activeSince = now
    .minus({
      minutes: options.maxAgeMinutes ?? DEFAULT_PUBLIC_SIGNAL_MAX_AGE_MINUTES,
    })
    .toUTC()
    .toISO();
  if (activeSince == null) {
    return [];
  }

  const clusterRows = await db
    .select({
      id: crowdReportClustersTable.id,
      effect: crowdReportClustersTable.effect,
      reportCount: getCrowdReportClusterOngoingReportCountSql(
        crowdReportClustersTable.id,
      ),
      windowStartAt: getCrowdReportClusterOngoingWindowStartAtSql(
        crowdReportClustersTable.id,
      ),
      windowEndAt: getCrowdReportClusterOngoingWindowEndAtSql(
        crowdReportClustersTable.id,
      ),
      updatedAt: crowdReportClustersTable.updated_at,
    })
    .from(crowdReportClustersTable)
    .where(
      and(
        eq(crowdReportClustersTable.status, 'accepted'),
        hasCrowdReportClusterScopeSql(),
        hasCrowdReportClusterCurrentConfidenceSql(
          options.minReportCount ?? DEFAULT_PUBLIC_SIGNAL_MIN_REPORTS,
          options.minDistinctIpHashes ??
            DEFAULT_PUBLIC_SIGNAL_MIN_DISTINCT_IP_HASHES,
        ),
        gte(
          getCrowdReportClusterOngoingWindowEndAtSql(
            crowdReportClustersTable.id,
          ),
          activeSince,
        ),
        options.lineId
          ? sql`exists (select 1 from ${crowdReportClusterLinesTable} where ${crowdReportClusterLinesTable.cluster_id} = ${crowdReportClustersTable.id} and ${crowdReportClusterLinesTable.line_id} = ${options.lineId})`
          : undefined,
        options.stationId
          ? sql`exists (select 1 from ${crowdReportClusterStationsTable} where ${crowdReportClusterStationsTable.cluster_id} = ${crowdReportClustersTable.id} and ${crowdReportClusterStationsTable.station_id} = ${options.stationId})`
          : undefined,
      ),
    )
    .orderBy(
      desc(
        getCrowdReportClusterOngoingWindowEndAtSql(crowdReportClustersTable.id),
      ),
    )
    .limit(options.limit ?? DEFAULT_PUBLIC_SIGNAL_LIMIT);

  const clusterIds = clusterRows.map((cluster) => cluster.id);
  if (clusterIds.length === 0) {
    return [];
  }

  const [lineRows, stationRows] = await Promise.all([
    db
      .select({
        clusterId: crowdReportClusterLinesTable.cluster_id,
        lineId: crowdReportClusterLinesTable.line_id,
      })
      .from(crowdReportClusterLinesTable)
      .where(inArray(crowdReportClusterLinesTable.cluster_id, clusterIds)),
    db
      .select({
        clusterId: crowdReportClusterStationsTable.cluster_id,
        stationId: crowdReportClusterStationsTable.station_id,
      })
      .from(crowdReportClusterStationsTable)
      .where(inArray(crowdReportClusterStationsTable.cluster_id, clusterIds)),
  ]);

  return clusterRows
    .map((cluster) => {
      const lineIds = lineRows
        .filter((row) => row.clusterId === cluster.id)
        .map((row) => row.lineId)
        .sort((a, b) => a.localeCompare(b));
      const stationIds = stationRows
        .filter((row) => row.clusterId === cluster.id)
        .map((row) => row.stationId)
        .sort((a, b) => a.localeCompare(b));

      return {
        id: cluster.id,
        effect: cluster.effect,
        reportCount: cluster.reportCount,
        lineIds,
        stationIds,
        windowStartAt: cluster.windowStartAt,
        windowEndAt: cluster.windowEndAt,
        updatedAt:
          cluster.updatedAt instanceof Date
            ? cluster.updatedAt.toISOString()
            : cluster.updatedAt,
      };
    })
    .filter((signal) => {
      if (signal.lineIds.length === 0 && signal.stationIds.length === 0) {
        return false;
      }
      if (options.lineId && !signal.lineIds.includes(options.lineId)) {
        return false;
      }
      if (options.stationId && !signal.stationIds.includes(options.stationId)) {
        return false;
      }
      return true;
    });
}
