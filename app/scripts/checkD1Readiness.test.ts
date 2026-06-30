import { describe, expect, it } from 'vitest';
import {
  extractJsonPayload,
  parseD1ExecuteResult,
} from './checkD1Readiness.js';

describe('extractJsonPayload', () => {
  it('extracts Wrangler JSON after proxy warning prelude text', () => {
    const stdout = [
      'Proxy environment variables detected. We will use your proxy.',
      '[{"results":[{"lines":10}],"success":true,"meta":{"rows_read":1}}]',
      '',
    ].join('\n');

    expect(extractJsonPayload(stdout)).toBe(
      '[{"results":[{"lines":10}],"success":true,"meta":{"rows_read":1}}]',
    );
  });

  it('preserves nested JSON payloads without consuming trailing text', () => {
    const stdout =
      'warning\n[{"results":[{"value":"} text"}],"meta":{"duration":1}}]\nextra';

    expect(JSON.parse(extractJsonPayload(stdout))).toEqual([
      {
        results: [{ value: '} text' }],
        meta: { duration: 1 },
      },
    ]);
  });
});

describe('parseD1ExecuteResult', () => {
  it('parses the first Wrangler D1 result object from noisy stdout', () => {
    expect(
      parseD1ExecuteResult(
        'Proxy environment variables detected.\n[{"results":[{"lines":10}],"success":true}]',
      ),
    ).toEqual({
      results: [{ lines: 10 }],
      success: true,
    });
  });
});
