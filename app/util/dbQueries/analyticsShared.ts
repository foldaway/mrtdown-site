import type { IssueType } from '@mrtdown/core';
import type { ChartEntry, Granularity, TimeScaleChart } from '~/types';

export type TimeScale = TimeScaleChart['dataTimeScale'];

export type IssueDayFactRow = {
  date: string;
  issue_id: string;
  issue_type: IssueType;
  active_anytime: boolean;
  duration_seconds: number;
};

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
