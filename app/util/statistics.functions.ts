import { createServerFn } from '@tanstack/react-start';
import { getStatisticsData } from './dbQueries/statistics';
import { timeServerSpan } from './serverTiming';

export const getStatisticsFn = createServerFn({ method: 'GET' }).handler(() =>
  timeServerSpan('statistics_loader', () => getStatisticsData()),
);
