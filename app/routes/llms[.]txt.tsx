import { createFileRoute } from '@tanstack/react-router';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getLlmsTxt } from '~/util/llmsTxt';

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET() {
        return createPublicMarkdownResponse(
          getLlmsTxt({
            rootUrl: import.meta.env.VITE_ROOT_URL,
          }),
        );
      },
    },
  },
});
