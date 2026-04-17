import { createServerFn } from '@tanstack/react-start';
import { getStatisticsData } from './db.queries';

export const getStatisticsFn = createServerFn({ method: 'GET' }).handler(
  () => getStatisticsData(),
);
