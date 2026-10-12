import { createServerFn } from '@tanstack/react-start';
import { getSitemapData } from './dbQueries/sitemap';
import { buildWeeklyArchive } from './weeklyArchive';

export const getWeeklyArchiveFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const data = await getSitemapData();
    return { weeks: buildWeeklyArchive(data.monthEarliest, data.currentDate) };
  },
);
