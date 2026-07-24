import type { Station } from '~/types';

export type ArrivalTiming = {
  serviceId: string;
  lineId: string;
  serviceName: Station['name'];
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  firstTrainTime: string | null;
  lastTrainTime: string | null;
  isServiceEnded: boolean;
  nextServiceStart: string | null;
  platformLabels: string[];
  departures: Array<{
    basis: 'first_train' | 'frequency_estimate' | 'last_train';
    headwaySeconds: number;
    headwayRangeSeconds: { min: number; max: number };
    time: string;
  }>;
};

export type ArrivalLine = {
  lineId: string;
  arrivalTimings: ArrivalTiming[];
};

export type StationExit = {
  id: number;
  label: string;
};
