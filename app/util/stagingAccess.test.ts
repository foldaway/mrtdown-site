import { generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { permitsStagingRequest } from './stagingAccess';

const issuer = 'https://foldaway.cloudflareaccess.com';
const audience = 'staging-audience';
const origin = 'https://mrtdown-site-staging.fly.dev';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const getKey = () => publicKey;
const passengerPath = '/api/stations/XPO/arrivals/v2';

function assertion(aud: string, expires: string, type = 'app') {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(privateKey);
}

function passengerRequest(token?: string) {
  return new Request(origin + passengerPath, {
    headers: token ? { 'cf-access-jwt-assertion': token } : undefined,
  });
}

describe('staging Access at the Fly origin', () => {
  it('requires a staging application token on passenger routes', async () => {
    expect(await permitsStagingRequest(passengerRequest(), audience)).toBe(
      false,
    );
    for (const token of [
      'forged',
      await assertion('other-app', '5m'),
      await assertion(audience, '-5m'),
      await assertion(audience, '5m', 'meta'),
    ]) {
      expect(
        await permitsStagingRequest(passengerRequest(token), audience, getKey),
      ).toBe(false);
    }
    const authorized = passengerRequest(await assertion(audience, '5m'));
    expect(await permitsStagingRequest(authorized, undefined, getKey)).toBe(
      false,
    );
    expect(await permitsStagingRequest(authorized, audience, getKey)).toBe(
      true,
    );
  });

  it('passes callbacks to their existing signature checks only for POST', async () => {
    const callback = `${origin}/internal/api/workflows/pull`;
    expect(await permitsStagingRequest(new Request(callback), audience)).toBe(
      false,
    );
    expect(
      await permitsStagingRequest(
        new Request(callback, { method: 'POST' }),
        audience,
      ),
    ).toBe(true);
  });
});
