import * as Sentry from '@sentry/tanstackstart-react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  captureCrowdReportDispatchAfterSubmissionFailure,
  captureCrowdReportDispatchRequestFailure,
} from './crowdReportDispatchDiagnostics';

const URL = 'https://www.mrtdown.org/internal/api/tasks/crowd-report-dispatch';
type TestEnvelope = readonly [
  unknown,
  readonly (readonly [{ type: string }, unknown])[],
];
let events: Sentry.Event[];

beforeEach(() => {
  events = [];
  Sentry.init({
    dsn: 'https://public@example.com/1',
    defaultIntegrations: false,
    transport: () => ({
      async send(envelope: TestEnvelope) {
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'event') events.push(payload as Sentry.Event);
        }
        return { statusCode: 200 };
      },
      async flush() {
        return true;
      },
    }),
  });
});

afterEach(async () => {
  await Sentry.close();
});

describe('crowd report dispatch diagnostics', () => {
  it('sends useful correlation data while stripping ambient credentials and body data', async () => {
    const request = new Request(`${URL}?token=query-secret`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer credential-secret',
        cookie: 'session=cookie-secret',
        'upstash-signature': 'signature-secret',
        'upstash-message-id': 'msg_test',
        'upstash-schedule-id': 'mrtdown-production-crowd-report-dispatch',
        'cf-ray': 'ray-test-SIN',
      },
      body: 'private-report-content',
    });

    Sentry.withScope((scope) => {
      scope.setUser({ id: 'private-user', ip_address: '127.0.0.1' });
      scope.setExtra('body', 'extra-secret');
      scope.setContext('ambient', { body: 'context-secret' });
      scope.setContext('trace', {
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
        data: { body: 'trace-secret' },
      });
      scope.addBreadcrumb({ message: 'breadcrumb-secret' });
      scope.addEventProcessor((event) => ({
        ...event,
        request: {
          url: request.url,
          headers: Object.fromEntries(request.headers),
          cookies: { session: 'cookie-secret' },
          data: 'private-report-content',
          query_string: 'token=query-secret',
        },
      }));
      captureCrowdReportDispatchRequestFailure(request, {
        status: 401,
        reason: 'token_mismatch',
      });
    });
    await Sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'warning',
      tags: { 'http.status_code': '401', reason: 'token_mismatch' },
      fingerprint: ['crowd-report-dispatch', '401', 'token_mismatch'],
      request: { method: 'POST', url: URL },
      contexts: {
        trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) },
        crowd_report_dispatch: {
          headerFormat: 'bearer',
          hasQstashSignature: true,
          qstashMessageId: 'msg_test',
          qstashScheduleId: 'mrtdown-production-crowd-report-dispatch',
          cloudflareRayId: 'ray-test-SIN',
        },
      },
    });
    const serialized = JSON.stringify(events[0]);
    for (const secret of [
      'query-secret',
      'credential-secret',
      'cookie-secret',
      'signature-secret',
      'private-report-content',
      'private-user',
      '127.0.0.1',
      'extra-secret',
      'context-secret',
      'trace-secret',
      'breadcrumb-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it.each(['REDACTED:secret-hash', 'Bearer REDACTED:secret-hash'])(
    'identifies a redaction placeholder without including its value: %s',
    async (authorization) => {
      captureCrowdReportDispatchRequestFailure(
        new Request(URL, { headers: { authorization } }),
        { status: 401, reason: 'token_mismatch' },
      );
      await Sentry.flush();
      expect(events[0].contexts?.crowd_report_dispatch).toMatchObject({
        headerFormat: 'redacted_placeholder',
      });
      expect(JSON.stringify(events)).not.toContain('secret-hash');
    },
  );

  it('captures validation codes and known fields without submitted values or unknown keys', async () => {
    const parsed = z.object({ dryRun: z.boolean() }).strict().safeParse({
      dryRun: 'private-value',
      'private-key': 'private-report',
    });
    if (parsed.success) throw new Error('Expected validation failure');
    captureCrowdReportDispatchRequestFailure(new Request(URL), {
      status: 400,
      reason: 'invalid_request',
      issues: parsed.error.issues,
    });
    await Sentry.flush();

    expect(events[0].contexts?.crowd_report_dispatch).toMatchObject({
      validationIssueCount: 2,
      validationIssues: ['invalid_type:dryRun', 'unrecognized_keys:<root>'],
    });
    expect(JSON.stringify(events)).not.toContain('private-');
  });

  it('does not report authentication failures from unrelated internal routes', async () => {
    captureCrowdReportDispatchRequestFailure(
      new Request('https://www.mrtdown.org/internal/api/tasks/other'),
      { status: 401, reason: 'missing_authorization' },
    );
    await Sentry.flush();
    expect(events).toEqual([]);
  });

  it('reports background exceptions with stacks while excluding the submitting request and error text', async () => {
    const error = new Error('private-upstream-response', {
      cause: new Error('private-cause'),
    });
    Sentry.withScope((scope) => {
      scope.setExtra('payload', 'private-report');
      scope.addBreadcrumb({ message: 'private-log' });
      scope.addEventProcessor((event) => ({
        ...event,
        request: {
          url: 'https://www.mrtdown.org/api/reports',
          headers: { authorization: 'Bearer private-token' },
          data: 'private-body',
        },
      }));
      captureCrowdReportDispatchAfterSubmissionFailure({
        reason: 'dispatch_exception',
        error,
      });
    });
    await Sentry.flush();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'error',
      tags: {
        component: 'crowd-report-dispatch',
        trigger: 'submission',
        reason: 'dispatch_exception',
      },
      contexts: { crowd_report_dispatch: { errorType: 'Error' } },
    });
    expect(events[0].request).toBeUndefined();
    expect(events[0].exception?.values?.[0]).toMatchObject({
      value: 'Crowd report dispatch after submission failed',
      stacktrace: { frames: expect.any(Array) },
    });
    expect(
      events[0].exception?.values?.[0].stacktrace?.frames?.length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain('private-');
  });

  it('includes sanitized ingest validation details for rejected background payloads', async () => {
    const parsed = z
      .object({
        content: z.array(
          z.object({ observedAt: z.iso.datetime({ offset: true }) }),
        ),
      })
      .safeParse({ content: [{ observedAt: 'private-timestamp' }] });
    if (parsed.success) throw new Error('Expected validation failure');
    captureCrowdReportDispatchAfterSubmissionFailure({
      reason: 'dispatch_exception',
      error: parsed.error,
    });
    await Sentry.flush();
    expect(events[0].contexts?.crowd_report_dispatch).toMatchObject({
      errorType: 'ZodError',
      validationIssues: ['invalid_format:content.0.observedAt'],
    });
    expect(JSON.stringify(events)).not.toContain('private-timestamp');
  });

  it.each(['private-thrown-value', { response: 'private-response' }])(
    'does not expose non-Error rejection values: %j',
    async (error) => {
      captureCrowdReportDispatchAfterSubmissionFailure({
        reason: 'dispatch_exception',
        error,
      });
      await Sentry.flush();
      expect(events).toHaveLength(1);
      expect(events[0].contexts?.crowd_report_dispatch).toMatchObject({
        errorType: 'non_error',
      });
      expect(JSON.stringify(events)).not.toContain('private-');
    },
  );

  it('reports missing configuration by name without credential values', async () => {
    captureCrowdReportDispatchAfterSubmissionFailure({
      reason: 'missing_configuration',
      missingConfiguration: ['CROWD_REPORT_DISPATCH_GITHUB_TOKEN'],
    });
    await Sentry.flush();
    expect(events[0]).toMatchObject({
      message: 'Crowd report dispatch after submission failed',
      tags: { trigger: 'submission', reason: 'missing_configuration' },
      contexts: {
        crowd_report_dispatch: {
          missingConfiguration: ['CROWD_REPORT_DISPATCH_GITHUB_TOKEN'],
        },
      },
    });
  });
});
