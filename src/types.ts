interface IssueBase {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  componentIdsAffected: string[];
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
  severity: 'minor' | 'major';
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
  color: string;
  startedAt: string;
}

export type IssueType = 'disruption' | 'maintenance' | 'infra';

export interface IssueRef {
  id: string;
  type: IssueType;
  title: string;
  componentIdsAffected: string[];
  startAt: string;
  endAt: string;
}

export interface DateSummary {
  issueTypesDurationMs: Partial<Record<IssueType, number>>;
  issues: IssueRef[];
}

export interface OverviewComponent {
  component: Component;
  dates: Record<string, DateSummary>;
}

export interface Overview {
  components: Record<string, OverviewComponent>;
  issuesOngoing: Issue[];
  dates: Record<string, DateSummary>;
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
