import { createFileRoute } from '@tanstack/react-router';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getOperatorMarkdown } from '~/util/agentMarkdownContent';
import { getOperatorProfileFn } from '~/util/operator.functions';

const DATE_COUNT = 90;

export const Route = createFileRoute('/operators/$operatorId/index.md')({
  server: {
    handlers: {
      async GET({ params }) {
        const profile = await getOperatorProfileFn({
          data: { operatorId: params.operatorId, days: DATE_COUNT },
        });

        return createPublicMarkdownResponse(
          getOperatorMarkdown(profile, {
            rootUrl: import.meta.env.VITE_ROOT_URL,
          }),
        );
      },
    },
  },
});
