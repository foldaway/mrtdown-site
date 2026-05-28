import { describe, expect, it } from 'vitest';
import {
  addSentryAnonymousUserCookie,
  createSentryAnonymousUserCookie,
  getSentryAnonymousUser,
  stripSentryUserIpAddress,
} from './sentryAnonymousUser';

const EXISTING_ID = 'c4bc6391-2d15-40e8-a01f-8a1e44928abc';
const NEW_ID = '4b03ee27-a155-4a50-9462-8f035f70bf08';

function request(cookie?: string) {
  return new Request('https://www.mrtdown.org/history', {
    headers: cookie != null ? { cookie } : undefined,
  });
}

describe('Sentry anonymous user IDs', () => {
  it('reuses an existing valid anonymous user cookie', () => {
    const user = getSentryAnonymousUser(
      request(`theme=dark; mrtdown_anon_id=${EXISTING_ID}; other=1`),
      () => NEW_ID,
    );

    expect(user).toEqual({
      cookieValue: EXISTING_ID,
      sentryUserId: `anon:${EXISTING_ID}`,
      shouldSetCookie: false,
    });
  });

  it('creates a new anonymous user ID when the cookie is absent', () => {
    const user = getSentryAnonymousUser(request(), () => NEW_ID);

    expect(user).toEqual({
      cookieValue: NEW_ID,
      sentryUserId: `anon:${NEW_ID}`,
      shouldSetCookie: true,
    });
  });

  it('replaces invalid anonymous user cookie values', () => {
    const user = getSentryAnonymousUser(
      request('mrtdown_anon_id=not-a-valid-id'),
      () => NEW_ID,
    );

    expect(user).toEqual({
      cookieValue: NEW_ID,
      sentryUserId: `anon:${NEW_ID}`,
      shouldSetCookie: true,
    });
  });

  it('creates an HttpOnly first-party cookie for the anonymous user ID', () => {
    expect(createSentryAnonymousUserCookie(NEW_ID)).toBe(
      [
        `mrtdown_anon_id=${NEW_ID}`,
        'Path=/',
        'Max-Age=31536000',
        'SameSite=Lax',
        'Secure',
        'HttpOnly',
      ].join('; '),
    );
  });

  it('adds the anonymous user cookie and prevents shared response caching', () => {
    const response = addSentryAnonymousUserCookie(
      new Response('ok', {
        headers: {
          'cache-control': 'public, s-maxage=60',
        },
      }),
      {
        cookieValue: NEW_ID,
        sentryUserId: `anon:${NEW_ID}`,
        shouldSetCookie: true,
      },
    );

    expect(response.headers.get('set-cookie')).toBe(
      createSentryAnonymousUserCookie(NEW_ID),
    );
    expect(response.headers.get('cache-control')).toBe('private, max-age=0');
  });

  it('does not add the anonymous user cookie when it is already present', () => {
    const response = addSentryAnonymousUserCookie(new Response('ok'), {
      cookieValue: EXISTING_ID,
      sentryUserId: `anon:${EXISTING_ID}`,
      shouldSetCookie: false,
    });

    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('strips Sentry user IP addresses without removing stable IDs', () => {
    expect(
      stripSentryUserIpAddress({
        user: {
          id: `anon:${EXISTING_ID}`,
          ip_address: '172.70.42.77',
        },
      }),
    ).toEqual({
      user: {
        id: `anon:${EXISTING_ID}`,
      },
    });

    expect(
      stripSentryUserIpAddress({ user: { ip_address: '172.70.42.77' } }),
    ).toEqual({
      user: undefined,
    });
  });
});
