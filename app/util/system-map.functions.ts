import { createServerFn } from '@tanstack/react-start';
import { getOverview, getStations } from '~/client';
import { assert } from './assert';

export const getSystemMapFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const activeIssuesResponse = await getOverview({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (activeIssuesResponse.error != null) {
      console.error(
        'Error fetching active issues:',
        activeIssuesResponse.error,
      );
      throw new Response('Failed to fetch active issues', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(activeIssuesResponse.data != null);

    const { data: overview } = activeIssuesResponse.data;

    const stationsResponse = await getStations({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (stationsResponse.error != null) {
      console.error('Error fetching stations:', stationsResponse.error);
      throw new Response('Failed to fetch stations', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(stationsResponse.data != null);

    return {
      overview,
      included: {
        issues: {
          ...activeIssuesResponse.data.included.issues,
          ...stationsResponse.data.included.issues,
        },
        landmarks: {
          ...activeIssuesResponse.data.included.landmarks,
          ...stationsResponse.data.included.landmarks,
        },
        lines: {
          ...activeIssuesResponse.data.included.lines,
          ...stationsResponse.data.included.lines,
        },
        stations: {
          ...activeIssuesResponse.data.included.stations,
          ...stationsResponse.data.included.stations,
        },
        towns: {
          ...activeIssuesResponse.data.included.towns,
          ...stationsResponse.data.included.towns,
        },
      },
    };
  },
);
