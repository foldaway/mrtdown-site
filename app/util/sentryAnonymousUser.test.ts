import { describe, expect, it } from 'vitest';
import {
  createSentryAnonymousUserCookie,
  getSentryAnonymousUser,
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
});
