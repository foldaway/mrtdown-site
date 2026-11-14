import { describe, expect, it } from 'vitest';
import { getClientIp } from './clientIp';

describe('getClientIp', () => {
  it.each([
    ['104.21.56.254', '198.51.100.5', '198.51.100.5'],
    ['2606:4700::1', '2001:0db8::001', '2001:db8::1'],
    ['::ffff:104.21.56.254', '198.51.100.5', '198.51.100.5'],
    ['203.0.113.10', '198.51.100.5', '203.0.113.10'],
    ['104.21.56.254', '198.51.100.5, 198.51.100.6', '104.21.56.254'],
    ['104.21.56.254', null, '104.21.56.254'],
    [null, '198.51.100.5', 'unknown'],
  ])(
    'resolves Fly peer %s and Cloudflare header %s to %s',
    (peer, rider, expected) => {
      const headers = new Headers({
        'x-forwarded-for': '198.51.100.6',
        'x-real-ip': '198.51.100.7',
      });
      if (peer) headers.set('fly-client-ip', peer);
      if (rider) headers.set('cf-connecting-ip', rider);
      expect(getClientIp(new Request('https://example.com', { headers }))).toBe(
        expected,
      );
    },
  );
});
