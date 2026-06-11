import { createFileRoute } from '@tanstack/react-router';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getIssueMarkdown } from '~/util/agentMarkdownContent';
import { getIssueFn } from '~/util/issue.functions';

export const Route = createFileRoute('/issues/$issueId/index.md')({
  server: {
    handlers: {
      async GET({ params }) {
        const issue = await getIssueFn({
          data: { issueId: params.issueId },
        });

        return createPublicMarkdownResponse(
          getIssueMarkdown(issue, {
            rootUrl: import.meta.env.VITE_ROOT_URL,
          }),
        );
      },
    },
  },
});
