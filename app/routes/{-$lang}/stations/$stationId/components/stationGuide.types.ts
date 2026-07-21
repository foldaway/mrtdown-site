import type { Station } from '~/types';

export type ArrivalTiming = {
  serviceId: string;
  lineId: string;
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  firstTrainTime: string | null;
  lastTrainTime: string | null;
  isServiceEnded: boolean;
  nextServiceStart: string | null;
  platformLabels: string[];
  departures: string[];
};

export type ArrivalLine = {
  lineId: string;
  arrivalTimings: ArrivalTiming[];
};

export type StationExit = {
  id: number;
  label: string;
};
