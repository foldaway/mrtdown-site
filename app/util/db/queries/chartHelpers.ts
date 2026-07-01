import type { ChartEntry, Granularity, TimeScaleChart } from '~/types';

export type TimeScale = TimeScaleChart['dataTimeScale'];

export function makeTimeScale(
  granularity: Granularity,
  count: number,
): TimeScale {
  return { granularity, count };
}

export function buildCountChart(
  title: string,
  entries: ChartEntry[],
  cumulative: ChartEntry[],
  dataTimeScale: TimeScale,
  displayTimeScale?: TimeScale,
): TimeScaleChart {
  return {
    title,
    data: entries,
    dataCumulative: cumulative,
    dataTimeScale,
    displayTimeScale,
  };
}
