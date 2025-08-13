export interface IssueStationEntry {
  componentId: string;
  branchName: string;
  stationIds: string[];
}

interface IssueBase {
  id: string;
  title: string;
  title_translations: Record<string, string>;
  startAt: string;
  endAt: string | null;
  componentIdsAffected: string[];
  stationIdsAffected: IssueStationEntry[];
}

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

export interface IssueDisruption extends IssueBase {
  type: 'disruption';
  updates: IssueDisruptionUpdate[];
  subtypes: IssueDisruptionSubtype[];
}

export interface IssueMaintenanceUpdate {
  type: 'operator.update' | 'planned';
  createdAt: string;
  sourceUrl: string;
  text: string;
}

export type IssueMaintenanceSubtype = 'track.work' | 'system.upgrade';

export interface IssueMaintenance extends IssueBase {
  type: 'maintenance';
  cancelledAt: string | null;
  rrule?: string;
  updates: IssueMaintenanceUpdate[];
  subtypes: IssueMaintenanceSubtype[];
}
export interface IssueInfraUpdate {
  type: 'operator.update' | 'planned';
  createdAt: string;
  sourceUrl: string;
  text: string;
}

export type IssueInfraSubtype =
  | 'elevator.outage'
  | 'escalator.outage'
  | 'station.renovation'
  | 'air_conditioning.issue';

export interface IssueInfra extends IssueBase {
  type: 'infra';
  rrule?: string;
  updates: IssueInfraUpdate[];
  subtypes: IssueInfraSubtype[];
}

export type Issue = IssueDisruption | IssueMaintenance | IssueInfra;

export interface ComponentBranch {
  id: string;
  title: string;
  title_translations: Record<string, string>;
  startedAt: string | null;
  endedAt: string | null;
  stationCodes: string[];
}

export type ComponentType = 'mrt.high' | 'mrt.medium' | 'lrt';

export interface Component {
  id: string;
  title: string;
  title_translations: Record<string, string>;
  type: ComponentType;
  color: string;
  startedAt: string;
  branches: Record<string, ComponentBranch>;
}

export type IssueType = 'disruption' | 'maintenance' | 'infra';

export interface IssueRef {
  id: string;
  type: IssueType;
  title: string;
  title_translations: Record<string, string>;
  componentIdsAffected: string[];
  stationIdsAffected: IssueStationEntry[];
  startAt: string;
  endAt: string | null;
  rrule?: string;
  subtypes: (
    | IssueDisruptionSubtype
    | IssueMaintenanceSubtype
    | IssueInfraSubtype
  )[];
}

export interface DateSummary {
  issues: IssueRef[];
  issueTypesDurationMs: Partial<Record<IssueType, number>>;
  componentIdsIssueTypesDurationMs: Record<
    string,
    Partial<Record<IssueType, number>>
  >;
  issueTypesIntervalsNoOverlapMs: Partial<Record<IssueType, string[]>>;
  componentIdsIssueTypesIntervalsNoOverlapMs: Record<
    string,
    Partial<Record<IssueType, string[]>>
  >;
}

export interface Overview {
  components: Component[];
  dates: Record<string, DateSummary>;
  issuesOngoingSnapshot: Issue[];
}

export interface Statistics {
  dates: Record<string, DateSummary>;
  issuesDisruptionHistoricalCount: number;
  issuesDisruptionDurationTotalDays: number;
  issuesDisruptionLongest: IssueRef[];
  componentsIssuesDisruptionCount: Record<string, number>;
  stationIssues: {
    station: Station;
    count: number;
  }[];
  componentsById: Record<string, Component>;
  issuesOngoingSnapshot: Issue[];
}

export type StationComponentMemberStructureType =
  | 'elevated'
  | 'underground'
  | 'at_grade'
  | 'in_building';

export interface StationComponentMember {
  code: string;
  startedAt: string;
  endedAt?: string;
  structureType: StationComponentMemberStructureType;
}

export interface StationGeo {
  latitude: number;
  longitude: number;
}

export interface Station {
  id: string;
  name: string;
  name_translations: Record<string, string>;
  town: string;
  town_translations: Record<string, string>;
  landmarks: string[];
  landmarks_translations: Record<string, string[]>;
  geo: StationGeo;
  componentMembers: Record<string, StationComponentMember[]>;
}

export interface StationManifest {
  station: Station;
  issueRefs: IssueRef[];
  componentsById: Record<string, Component>;
}

export interface ComponentManifest {
  componentId: string;
  componentsById: Record<string, Component>;
  stationsByCode: Record<string, Station>;
  issueRefs: IssueRef[];
}

export interface ComponentStatusManifest {
  componentId: string;
  componentsById: Record<string, Component>;
  stationsByCode: Record<string, Station>;
  issuesOngoingSnapshot: Issue[];
  dates: Record<string, DateSummary>;
  lastUpdatedAt: string;
  issuesRecent: IssueRef[];
  issueCountByType: Record<IssueType, number>;
  lastMajorDisruption: IssueRef | null;
}

export interface IssuesHistory {
  pageCount: number;
  fileNames: string[];
}

export interface IssuesHistoryPage {
  startAt: string;
  endAt: string;
  sections: IssuesHistoryPageSection[];
}

export interface IssuesHistoryPageSection {
  id: string;
  sectionStartAt: string;
  sectionEndAt: string;
  issueRefs: IssueRef[];
}

export type StationIndex = string[];
export type ComponentIndex = string[];
export type IssueIndex = string[];

export type StationTranslatedNames = Record<string, string>;

export interface FooterManifest {
  components: Component[];
  featuredStations: Station[];
  lastUpdatedAt: string;
}
