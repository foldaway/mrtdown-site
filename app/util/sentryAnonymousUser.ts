import z from 'zod';

const SENTRY_ANONYMOUS_USER_COOKIE_NAME = 'mrtdown_anon_id';
const SENTRY_ANONYMOUS_USER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const SentryAnonymousUserCookieSchema = z.uuid();

export type SentryAnonymousUser = {
  cookieValue: string;
  sentryUserId: string;
  shouldSetCookie: boolean;
};

export function getSentryAnonymousUser(
  request: Request,
  createId = () => crypto.randomUUID(),
): SentryAnonymousUser {
  const existingCookieValue = getCookieValue(
    request.headers.get('cookie'),
    SENTRY_ANONYMOUS_USER_COOKIE_NAME,
  );

  if (
    existingCookieValue != null &&
    isValidSentryAnonymousUserCookieValue(existingCookieValue)
  ) {
    return {
      cookieValue: existingCookieValue,
      sentryUserId: toSentryUserId(existingCookieValue),
      shouldSetCookie: false,
    };
  }

  const cookieValue = createId();
  if (!isValidSentryAnonymousUserCookieValue(cookieValue)) {
    throw new Error('Generated invalid Sentry anonymous user ID');
  }

  return {
    cookieValue,
    sentryUserId: toSentryUserId(cookieValue),
    shouldSetCookie: true,
  };
}

export function createSentryAnonymousUserCookie(cookieValue: string) {
  if (!isValidSentryAnonymousUserCookieValue(cookieValue)) {
    throw new Error('Invalid Sentry anonymous user cookie value');
  }

  return [
    `${SENTRY_ANONYMOUS_USER_COOKIE_NAME}=${cookieValue}`,
    'Path=/',
    `Max-Age=${SENTRY_ANONYMOUS_USER_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    'Secure',
    'HttpOnly',
  ].join('; ');
}

export function addSentryAnonymousUserCookie(
  response: Response,
  sentryAnonymousUser: SentryAnonymousUser,
) {
  if (!sentryAnonymousUser.shouldSetCookie || response.status === 101) {
    return response;
  }

  const cookie = createSentryAnonymousUserCookie(
    sentryAnonymousUser.cookieValue,
  );

  try {
    response.headers.append('Set-Cookie', cookie);
    preventSharedCachingOfCookieResponse(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.append('Set-Cookie', cookie);
    preventSharedCachingOfCookieResponse(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export function stripSentryUserIpAddress<
  TEvent extends { user?: Record<string, unknown> | null },
>(event: TEvent) {
  if (event.user == null) {
    return event;
  }

  const user = { ...event.user };
  delete user.ip_address;
  event.user = Object.keys(user).length > 0 ? user : undefined;

  return event;
}

function getCookieValue(cookieHeader: string | null, cookieName: string) {
  if (cookieHeader == null || cookieHeader === '') {
    return null;
  }

  for (const cookiePart of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookiePart.split('=');
    if (name?.trim() === cookieName) {
      return valueParts.join('=').trim();
    }
  }

  return null;
}

function isValidSentryAnonymousUserCookieValue(value: string) {
  return SentryAnonymousUserCookieSchema.safeParse(value).success;
}

function preventSharedCachingOfCookieResponse(headers: Headers) {
  const cacheControl = headers.get('Cache-Control')?.toLowerCase();
  if (
    cacheControl == null ||
    (!cacheControl.includes('private') && !cacheControl.includes('no-store'))
  ) {
    headers.set('Cache-Control', 'private, max-age=0');
  }
}

function toSentryUserId(cookieValue: string) {
  return `anon:${cookieValue}`;
}
