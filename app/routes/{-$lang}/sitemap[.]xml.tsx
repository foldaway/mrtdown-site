import { createFileRoute } from '@tanstack/react-router';
import {
  createSitemapErrorResponse,
  getSitemapXml,
} from '~/util/sitemap.functions';

export const Route = createFileRoute('/{-$lang}/sitemap.xml')({
  server: {
    handlers: {
      async GET() {
        const rootUrl =
          import.meta.env.VITE_ROOT_URL ?? 'http://localhost:3000';
        try {
          return new Response(await getSitemapXml(), {
            headers: {
              'content-type': 'application/xml',
              'x-sitemap-status': 'ok',
            },
          });
        } catch (error) {
          return createSitemapErrorResponse(error, rootUrl);
        }
      },
    },
  },
});
