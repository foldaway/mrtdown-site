import type { getIssueData } from '../db/queries/issues';
import type { getLineProfileData } from '../db/queries/lines';
import type { getOperatorProfileData } from '../db/queries/operators';
import type { getOverviewData } from '../db/queries/overview';
import type { getStationProfileData } from '../db/queries/stations';

export const DEFAULT_ROOT_URL = 'https://www.mrtdown.org';

export interface AgentMarkdownOptions {
  rootUrl?: string;
}

export type OverviewPayload = Awaited<ReturnType<typeof getOverviewData>>;
export type LineProfilePayload = Awaited<ReturnType<typeof getLineProfileData>>;
export type StationProfilePayload = Awaited<
  ReturnType<typeof getStationProfileData>
>;
export type OperatorProfilePayload = Awaited<
  ReturnType<typeof getOperatorProfileData>
>;
export type IssuePayload = Awaited<ReturnType<typeof getIssueData>>;
