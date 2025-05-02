export interface IssueStationEntry {
  componentId: string;
  branchName: string;
  stationIds: string[];
}

interface IssueBase {
  id: string;
  title: string;
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

export interface IssueDisruption extends IssueBase {
  type: 'disruption';
  updates: IssueDisruptionUpdate[];
}

export interface IssueMaintenanceUpdate {
  type: 'operator.update' | 'planned';
  createdAt: string;
  sourceUrl: string;
  text: string;
}

export interface IssueMaintenance extends IssueBase {
  type: 'maintenance';
  cancelledAt: string | null;
  updates: IssueMaintenanceUpdate[];
}
export interface IssueInfraUpdate {
  type: 'operator.update';
  createdAt: string;
  sourceUrl: string;
  text: string;
}

export interface IssueInfra extends IssueBase {
  type: 'infra';
  updates: IssueInfraUpdate[];
}

export type Issue = IssueDisruption | IssueMaintenance | IssueInfra;

export interface Component {
  id: string;
  title: string;
  title_translations: Record<string, string>;
  color: string;
  startedAt: string;
  branches: Record<string, string[]>;
}

export type IssueType = 'disruption' | 'maintenance' | 'infra';

export interface IssueRef {
  id: string;
  type: IssueType;
  title: string;
  componentIdsAffected: string[];
  stationIdsAffected: IssueStationEntry[];
  startAt: string;
  endAt: string | null;
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
  issuesOngoing: Issue[];
}

export interface Statistics {
  dates: Record<string, DateSummary>;
  issuesOngoing: Issue[];
  issuesDisruptionHistoricalCount: number;
  issuesDisruptionDurationTotalDays: number;
  issuesDisruptionLongest: IssueRef[];
  componentsIssuesDisruptionCount: Record<string, number>;
  stationIssues: {
    station: Station;
    count: number;
  }[];
}

export interface StationComponentMember {
  code: string;
  startedAt: string;
  endedAt?: string;
}

export interface Station {
  id: string;
  name: string;
  name_translations: Record<string, string>;
  componentMembers: Record<string, StationComponentMember[]>;
}

export interface StationManifest {
  station: Station;
  issueRefs: IssueRef[];
}

export interface ComponentManifest {
  componentId: string;
  componentsById: Record<string, Component>;
  stationsByCode: Record<string, Station>;
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

export type StationIndex = Record<string, string[]>;

export type StationTranslatedNames = Record<string, string>;
