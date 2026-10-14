import { createServerFn } from '@tanstack/react-start';
import { getSitemapData } from './dbQueries/sitemap';
import { buildWeeklyArchive } from './weeklyArchive';

export const getWeeklyArchiveFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const data = await getSitemapData();
    return {
      weeks: data.reportEarliestDate
        ? buildWeeklyArchive(data.reportEarliestDate, data.currentDate)
        : [],
    };
  },
);
