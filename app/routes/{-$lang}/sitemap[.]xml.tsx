import { createFileRoute } from '@tanstack/react-router';
import { getSitemapFn } from '~/util/sitemap.functions';

export const Route = createFileRoute('/{-$lang}/sitemap.xml')({
  server: {
    handlers: {
      async GET() {
        return new Response(await getSitemapFn(), {
          headers: {
            'content-type': 'application/xml',
          },
        });
      },
    },
  },
});
