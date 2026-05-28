const SENTRY_ANONYMOUS_USER_COOKIE_NAME = 'mrtdown_anon_id';
const SENTRY_ANONYMOUS_USER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return UUID_PATTERN.test(value);
}

function toSentryUserId(cookieValue: string) {
  return `anon:${cookieValue}`;
}
