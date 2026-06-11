import { createFileRoute } from '@tanstack/react-router';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getLineMarkdown } from '~/util/agentMarkdownContent';
import { getLineProfileFn } from '~/util/lines.functions';

const DATE_COUNT = 90;

export const Route = createFileRoute('/lines/$lineId/index.md')({
  server: {
    handlers: {
      async GET({ params }) {
        const profile = await getLineProfileFn({
          data: { lineId: params.lineId, days: DATE_COUNT },
        });

        return createPublicMarkdownResponse(
          getLineMarkdown(profile, {
            rootUrl: import.meta.env.VITE_ROOT_URL,
          }),
        );
      },
    },
  },
});
