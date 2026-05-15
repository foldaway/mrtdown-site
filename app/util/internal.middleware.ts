import { env } from 'cloudflare:workers';
import { createMiddleware } from '@tanstack/react-start';

export const internalMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (import.meta.env.DEV) {
      // In development, we allow all requests
      return next();
    }
    const auth = request.headers.get('Authorization');
    const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const permittedTokens =
      env.INTERNAL_API_TOKENS?.split(',')
        .map((t) => t.trim())
        .filter(Boolean) ?? [];
    if (!permittedTokens.includes(token)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return next();
  },
);
