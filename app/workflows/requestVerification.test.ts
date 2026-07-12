import { describe, expect, it } from 'vitest';
import { isWorkflowRequestVerificationConfigured } from './requestVerification';

describe('isWorkflowRequestVerificationConfigured', () => {
  it('requires both production signing keys', () => {
    expect(isWorkflowRequestVerificationConfigured({})).toBe(false);
    expect(
      isWorkflowRequestVerificationConfigured({
        QSTASH_CURRENT_SIGNING_KEY: 'current',
      }),
    ).toBe(false);
    expect(
      isWorkflowRequestVerificationConfigured({
        QSTASH_CURRENT_SIGNING_KEY: 'current',
        QSTASH_NEXT_SIGNING_KEY: 'next',
      }),
    ).toBe(true);
  });

  it('allows the local QStash development server', () => {
    expect(
      isWorkflowRequestVerificationConfigured({ QSTASH_DEV: 'true' }),
    ).toBe(true);
  });
});
