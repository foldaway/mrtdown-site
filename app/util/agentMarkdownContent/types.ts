import type { getIssueReadModel } from '../dbQueries/issue';
import type { getLineProfileReadModel } from '../dbQueries/lines';
import type { getOperatorProfileData } from '../dbQueries/operators';
import type { getOverviewData } from '../dbQueries/overview';
import type { getStationProfileReadModel } from '../dbQueries/stations';

export const DEFAULT_ROOT_URL = 'https://www.mrtdown.org';

export interface AgentMarkdownOptions {
  rootUrl?: string;
}

export type OverviewPayload = Awaited<ReturnType<typeof getOverviewData>>;
export type LineProfilePayload = Awaited<
  ReturnType<typeof getLineProfileReadModel>
>;
export type StationProfilePayload = Awaited<
  ReturnType<typeof getStationProfileReadModel>
>;
export type OperatorProfilePayload = Awaited<
  ReturnType<typeof getOperatorProfileData>
>;
export type IssuePayload = Awaited<ReturnType<typeof getIssueReadModel>>;
