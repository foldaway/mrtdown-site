import {
  type IngestContentCrowdReportEffect,
  IngestContentCrowdReportEffectSchema,
} from '@mrtdown/ingest-contracts';
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  crowdReportAbuseEventsTable,
  crowdReportLinesTable,
  crowdReportModerationEventsTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  linesTable,
  stationsTable,
  crowdReportStationsTable,
} from '~/db/schema';

const SG_TIMEZONE = 'Asia/Singapore';
const DEFAULT_RATE_LIMIT_PER_HOUR = 5;
const MAX_REPORT_AGE_HOURS = 24;
const MAX_REPORT_FUTURE_MINUTES = 15;
const DEFAULT_DUPLICATE_WINDOW_MINUTES = 10;
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

type AutomoderateCrowdReportOptions = {
  duplicateWindowMinutes?: number;
  idFactory?: () => string;
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
        status: crowdReportsTable.status,
        directionText: crowdReportsTable.direction_text,
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

  return db.transaction((tx) =>
    automoderateCrowdReportInTransaction(
      tx,
      reportId,
      submission,
      duplicateWindowMinutes,
      idFactory,
    ),
  );
}

async function automoderateCrowdReportInTransaction(
  tx: CrowdReportTransaction,
  reportId: string,
  submission: CrowdReportSubmission,
  duplicateWindowMinutes: number,
  idFactory: () => string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${buildDuplicateLockKey(submission)}, 0::bigint))`,
  );

  const duplicate = await findDuplicateCrowdReport(
    tx,
    reportId,
    submission,
    duplicateWindowMinutes,
  );
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

  return (
    updatedReport ?? {
      id: reportId,
      status,
      duplicateOfId: duplicate?.id ?? null,
    }
  );
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
    );
  });
}
