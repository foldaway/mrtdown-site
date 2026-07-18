import { z } from 'zod';
import { StructuredCrowdReportSubmissionSchema } from './crowdReports';

const ProducerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
  .refine((value) => value !== 'public', {
    message: 'public is reserved for unauthenticated submissions',
  });

const HttpOriginSchema = z
  .string()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'Source origins must use HTTP or HTTPS',
      });
      return z.NEVER;
    }
    return url.origin;
  });

const ProducerConfigSchema = z
  .record(
    ProducerIdSchema,
    z
      .object({
        token: z.string().min(16).max(4096),
        sourceOrigins: z.array(HttpOriginSchema).max(16).default([]),
      })
      .strict(),
  )
  .superRefine((producers, context) => {
    const seenTokens = new Set<string>();
    for (const [producer, config] of Object.entries(producers)) {
      if (seenTokens.has(config.token)) {
        context.addIssue({
          code: 'custom',
          message: `Producer ${producer} reuses another producer token`,
        });
      }
      seenTokens.add(config.token);
    }
  });

const SourceUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'sourceUrl must use HTTP or HTTPS',
      });
      return z.NEVER;
    }
    return url.href;
  });

export const ProgrammaticCrowdReportRequestSchema = z
  .object({
    externalReportId: z.string().trim().min(1).max(256),
    sourceUrl: SourceUrlSchema.optional(),
    report: StructuredCrowdReportSubmissionSchema,
  })
  .strict();

export type ProgrammaticCrowdReportRequest = z.infer<
  typeof ProgrammaticCrowdReportRequestSchema
>;

export type CrowdReportProducer = {
  id: string;
  sourceOrigins: string[];
};

export type CrowdReportProducerAuthenticationResult =
  | { success: true; producer: CrowdReportProducer }
  | { success: false; status: 401 | 503; error: string };

export async function authenticateCrowdReportProducer(
  request: Request,
  serializedConfig: string | undefined,
): Promise<CrowdReportProducerAuthenticationResult> {
  const producers = parseProducerConfig(serializedConfig);
  if (producers == null) {
    return {
      success: false,
      status: 503,
      error: 'Programmatic crowd reports are not configured',
    };
  }

  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return { success: false, status: 401, error: 'Unauthorized' };
  }

  const tokenDigest = await digestBytes(token);
  const entries = Object.entries(producers);
  const secretDigests = await Promise.all(
    entries.map(([, config]) => digestBytes(config.token)),
  );
  const matchingIndex = secretDigests.findIndex((digest) =>
    constantTimeBytesEqual(tokenDigest, digest),
  );
  const matchingEntry = entries[matchingIndex];
  if (matchingEntry == null) {
    return { success: false, status: 401, error: 'Unauthorized' };
  }

  return {
    success: true,
    producer: {
      id: matchingEntry[0],
      sourceOrigins: matchingEntry[1].sourceOrigins,
    },
  };
}

export function isProgrammaticCrowdReportSourceAllowed(
  producer: CrowdReportProducer,
  sourceUrl: string | undefined,
) {
  if (sourceUrl == null) {
    return true;
  }
  return producer.sourceOrigins.includes(new URL(sourceUrl).origin);
}

export async function hashProgrammaticCrowdReportPayload(
  request: ProgrammaticCrowdReportRequest,
) {
  const canonicalPayload = JSON.stringify({
    sourceUrl: request.sourceUrl ?? null,
    report: {
      reportScope: request.report.reportScope,
      observedAt: request.report.observedAt ?? null,
      lineIds: [...new Set(request.report.lineIds)].sort(),
      stationIds: [...new Set(request.report.stationIds)].sort(),
      directionStationId: request.report.directionStationId ?? null,
      directionUnknown: request.report.directionUnknown ?? null,
      effect: request.report.effect,
      delayMinutes: request.report.delayMinutes ?? null,
      isStillHappening: request.report.isStillHappening ?? null,
    },
  });
  const digest = await digestBytes(canonicalPayload);
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseProducerConfig(serializedConfig: string | undefined) {
  if (!serializedConfig) {
    return undefined;
  }
  try {
    const parsed = ProducerConfigSchema.safeParse(JSON.parse(serializedConfig));
    return parsed.success && Object.keys(parsed.data).length > 0
      ? parsed.data
      : undefined;
  } catch {
    return undefined;
  }
}

async function digestBytes(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
