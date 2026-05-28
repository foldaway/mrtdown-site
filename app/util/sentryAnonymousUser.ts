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

function toSentryUserId(cookieValue: string) {
  return `anon:${cookieValue}`;
}
