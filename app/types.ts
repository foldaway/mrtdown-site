export interface IssueDisruptionUpdate {
  type:
    | 'general-public.report'
    | 'news.report'
    | 'operator.update'
    | 'operator.investigating'
    | 'operator.monitoring'
    | 'operator.resolved';
  createdAt: string;
  sourceUrl: string;
  text: string;
}

export type IssueDisruptionSubtype =
  | 'signal.fault'
  | 'track.fault'
  | 'train.fault'
  | 'power.fault'
  | 'security'
  | 'weather'
  | 'passenger.incident'
  | 'platform_door.fault'
  | 'station.fault'
  | 'delay';

export type IssueMaintenanceSubtype = 'track.work' | 'system.upgrade';

export type IssueInfraSubtype =
  | 'elevator.outage'
  | 'escalator.outage'
  | 'station.renovation'
  | 'air_conditioning.issue';
