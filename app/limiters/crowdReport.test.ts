import { describe, expect, it } from 'vitest';
import { CROWD_REPORT_REDIS_OPTIONS } from './crowdReport';

describe('crowd report Redis options', () => {
  it('fails limiter commands promptly when Redis is unavailable', () => {
    expect(CROWD_REPORT_REDIS_OPTIONS).toEqual({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  });
});
