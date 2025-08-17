import { defineMessage, type MessageDescriptor } from 'react-intl';
import type {
  IssueType,
  LineSummaryStatus,
  LineType,
  StationComponentMemberStructureType,
} from './client';
import type {
  IssueDisruptionSubtype,
  IssueInfraSubtype,
  IssueMaintenanceSubtype,
} from './types';

export const LANGUAGES_NON_DEFAULT = ['zh-Hans', 'ms', 'ta'];

export const LineSummaryStatusLabels: Record<
  LineSummaryStatus,
  MessageDescriptor
> = {
  ongoing_disruption: defineMessage({
    id: 'status.ongoing_disruption',
    defaultMessage: 'Disruption',
  }),
  ongoing_maintenance: defineMessage({
    id: 'status.ongoing_maintenance',
    defaultMessage: 'Maintenance',
  }),
  ongoing_infra: defineMessage({
    id: 'status.ongoing_infra',
    defaultMessage: 'Infrastructure',
  }),
  normal: defineMessage({
    id: 'status.operational',
    defaultMessage: 'Operational',
  }),
  closed_for_day: defineMessage({
    id: 'status.service_ended',
    defaultMessage: 'Service Ended',
  }),
  future_service: defineMessage({
    id: 'status.future_service',
    defaultMessage: 'Under Development',
  }),
};

export const IssueTypeLabels: Record<IssueType, MessageDescriptor> = {
  disruption: defineMessage({
    id: 'general.disruption',
    defaultMessage: 'Disruption',
  }),
  maintenance: defineMessage({
    id: 'general.maintenance',
    defaultMessage: 'Maintenance',
  }),
  infra: defineMessage({
    id: 'general.infrastructure',
    defaultMessage: 'Infrastructure',
  }),
};

export const IssueSubtypeLabels: Record<
  IssueDisruptionSubtype | IssueMaintenanceSubtype | IssueInfraSubtype,
  MessageDescriptor
> = {
  'signal.fault': defineMessage({
    id: 'issue.subtype.signal_fault',
    defaultMessage: 'Signal Fault',
  }),
  'track.fault': defineMessage({
    id: 'issue.subtype.track_fault',
    defaultMessage: 'Track Fault',
  }),
  'train.fault': defineMessage({
    id: 'issue.subtype.train_fault',
    defaultMessage: 'Train Fault',
  }),
  'station.fault': defineMessage({
    id: 'issue.subtype.station_fault',
    defaultMessage: 'Station Fault',
  }),
  'power.fault': defineMessage({
    id: 'issue.subtype.power_fault',
    defaultMessage: 'Power Fault',
  }),
  security: defineMessage({
    id: 'issue.subtype.security',
    defaultMessage: 'Security',
  }),
  weather: defineMessage({
    id: 'issue.subtype.weather',
    defaultMessage: 'Weather',
  }),
  'passenger.incident': defineMessage({
    id: 'issue.subtype.passenger_incident',
    defaultMessage: 'Passenger Incident',
  }),
  'platform_door.fault': defineMessage({
    id: 'issue.subtype.platform_door_fault',
    defaultMessage: 'Platform Door Fault',
  }),
  delay: defineMessage({ id: 'issue.subtype.delay', defaultMessage: 'Delay' }),
  'track.work': defineMessage({
    id: 'issue.subtype.track_work',
    defaultMessage: 'Track Work',
  }),
  'station.renovation': defineMessage({
    id: 'issue.subtype.station_renovation',
    defaultMessage: 'Station Renovation',
  }),
  'system.upgrade': defineMessage({
    id: 'issue.subtype.system_upgrade',
    defaultMessage: 'System Upgrade',
  }),
  'elevator.outage': defineMessage({
    id: 'issue.subtype.elevator_outage',
    defaultMessage: 'Elevator Outage',
  }),
  'escalator.outage': defineMessage({
    id: 'issue.subtype.escalator_outage',
    defaultMessage: 'Escalator Outage',
  }),
  'air_conditioning.issue': defineMessage({
    id: 'issue.subtype.air_conditioning_issue',
    defaultMessage: 'Air Conditioning Issue',
  }),
};

export const LineTypeLabels: Record<LineType, MessageDescriptor> = {
  'mrt.high': defineMessage({
    id: 'general.mrt',
    defaultMessage: 'Mass Rapid Transit (MRT)',
  }),
  'mrt.medium': defineMessage({
    id: 'general.mrt',
    defaultMessage: 'Mass Rapid Transit (MRT)',
  }),
  lrt: defineMessage({
    id: 'general.lrt',
    defaultMessage: 'Light Rail Transit (LRT)',
  }),
};

export const StationStructureTypeLabels: Record<
  StationComponentMemberStructureType,
  MessageDescriptor
> = {
  elevated: defineMessage({
    id: 'station.structure_type.elevated',
    defaultMessage: 'elevated',
  }),
  underground: defineMessage({
    id: 'station.structure_type.underground',
    defaultMessage: 'underground',
  }),
  at_grade: defineMessage({
    id: 'station.structure_type.at_grade',
    defaultMessage: 'at-grade',
  }),
  in_building: defineMessage({
    id: 'station.structure_type.in_building',
    defaultMessage: 'enclosed',
  }),
};
