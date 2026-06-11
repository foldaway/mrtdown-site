import { createFileRoute } from '@tanstack/react-router';
import { createPublicMarkdownResponse } from '~/util/agentMarkdown';
import { getStationMarkdown } from '~/util/agentMarkdownContent';
import { getStationProfileFn } from '~/util/station.functions';

export const Route = createFileRoute('/stations/$stationId/index.md')({
  server: {
    handlers: {
      async GET({ params }) {
        const profile = await getStationProfileFn({
          data: { stationId: params.stationId },
        });

        return createPublicMarkdownResponse(
          getStationMarkdown(profile, {
            rootUrl: import.meta.env.VITE_ROOT_URL,
          }),
        );
      },
    },
  },
});
