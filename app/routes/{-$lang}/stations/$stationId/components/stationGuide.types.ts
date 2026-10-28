import type { StationArrivalBranch } from '~/util/stationArrivalBranches';

export type ArrivalTiming = StationArrivalBranch;

export type ArrivalLine = {
  lineId: string;
  arrivalTimings: ArrivalTiming[];
};

export type StationExit = { id: number; label: string };
