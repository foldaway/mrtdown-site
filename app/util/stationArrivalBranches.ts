import type { Station } from '@mrtdown/core';

/** Canonical branch identity and display metadata; contains no arrival predictions. */
export type StationArrivalBranch = {
  serviceId: string;
  lineId: string;
  serviceName: Station['name'];
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  platformLabels: string[];
};
