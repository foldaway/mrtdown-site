import { createFileRoute } from '@tanstack/react-router';
import { HOME_OVERVIEW_INITIAL_DATE_COUNT } from '~/constants';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getOverviewMarkdown } from '~/util/agentMarkdownContent';
import { getOverviewFn } from '~/util/overview.functions';

export const Route = createFileRoute('/index.md')({
  server: {
    handlers: {
      async GET() {
        const overview = await getOverviewFn({
          data: { days: HOME_OVERVIEW_INITIAL_DATE_COUNT },
        });

        return createPublicMarkdownResponse(
          getOverviewMarkdown(overview, {
            rootUrl: import.meta.env.VITE_ROOT_URL,
          }),
        );
      },
    },
  },
});
