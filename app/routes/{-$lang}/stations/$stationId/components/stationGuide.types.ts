import type { EstimatedArrivalTiming } from '~/util/estimatedArrivals';

export type ArrivalTiming = EstimatedArrivalTiming & {
  platformLabels: string[];
};

export type ArrivalLine = {
  lineId: string;
  arrivalTimings: ArrivalTiming[];
};

export type StationExit = {
  id: number;
  label: string;
};
