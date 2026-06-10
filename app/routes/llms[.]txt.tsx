import { createFileRoute } from '@tanstack/react-router';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getLlmsTxt } from '~/util/llmsTxt';

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET() {
        return createPublicMarkdownResponse(
          getLlmsTxt({
            rootUrl: process.env.ROOT_URL ?? 'https://www.mrtdown.org',
          }),
        );
      },
    },
  },
});
