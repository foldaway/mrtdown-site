import { useEffect } from 'react';

/**
 * Establishes the HttpOnly anonymous Sentry cookie after hydration.
 *
 * Keeping this request separate from the SSR document prevents `Set-Cookie`
 * from making otherwise public HTML ineligible for Cloudflare caching. The
 * endpoint is intentionally best-effort because telemetry identity must never
 * affect page rendering or availability.
 */
export function SentryAnonymousUserBootstrap() {
  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }

    void fetch('/api/sentry-anonymous-user', {
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, []);

  return null;
}
