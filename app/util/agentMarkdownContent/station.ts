import type { PhrasingContent } from 'mdast';
import { markdownTable, serializeAgentMarkdown } from '../agentMarkdown';
import {
  communitySignalsSection,
  compactRootContent,
  entityName,
  formatIssueCounts,
  heading,
  issueListOrEmpty,
  LINE_STATUS_LABELS,
  link,
  list,
  paragraph,
  text,
} from './shared';
import { DEFAULT_ROOT_URL, type AgentMarkdownOptions } from './types';
import type { IncludedEntities, Station } from '~/types';
import type { StationProfilePayload } from './types';

export function getStationMarkdown(
  payload: StationProfilePayload,
  options?: AgentMarkdownOptions,
) {
  const rootUrl = options?.rootUrl ?? DEFAULT_ROOT_URL;
  const { data, included } = payload;
  const station = included.stations[data.stationId];
  const stationName = station != null ? entityName(station) : data.stationId;
  const recentIssues = data.issueIdsRecent
    .map((issueId) => included.issues[issueId])
    .filter((issue) => issue != null);
  const memberships = uniqueStationMemberships(station);
  const membershipRows = memberships.map((membership) => {
    const line = included.lines[membership.lineId];
    return [
      membership.code,
      membership.lineId,
      line != null ? entityName(line) : membership.lineId,
      membership.structureType,
      membership.startedAt,
    ];
  });
  const membershipTable = markdownTable({
    headers: ['Code', 'Line ID', 'Line', 'Structure', 'Started'],
    rows: membershipRows,
  });

  return serializeAgentMarkdown(
    compactRootContent([
      heading(1, `${stationName} Station (${data.stationId})`),
      paragraph([text(`Current status: ${LINE_STATUS_LABELS[data.status]}.`)]),
      heading(2, 'Links'),
      list([
        [link('Human page', `/stations/${data.stationId}`, rootUrl)],
        [link('Overview Markdown', '/index.md', rootUrl)],
      ]),
      heading(2, 'Facts'),
      list([
        [text(`Station ID: ${data.stationId}`)],
        [text(`Issue counts: ${formatIssueCounts(data.issueCountByType)}`)],
        ...stationAreaFacts(station, included),
      ]),
      heading(2, 'Lines Served'),
      membershipTable,
      ...issueListOrEmpty('Recent Issues', recentIssues, rootUrl),
      ...communitySignalsSection(data.communitySignals, included, rootUrl),
    ]),
  );
}

function stationAreaFacts(
  station: Station | undefined,
  included: IncludedEntities,
): PhrasingContent[][] {
  if (station == null) {
    return [];
  }
  const town = included.towns[station.townId];
  const landmarks = station.landmarkIds
    .map((landmarkId) => included.landmarks[landmarkId])
    .filter((landmark) => landmark != null)
    .map((landmark) => entityName(landmark));

  return [
    [text(`Town: ${town != null ? entityName(town) : station.townId}`)],
    [text(`Nearby landmarks: ${landmarks.join(', ') || 'None listed'}`)],
  ];
}

function uniqueStationMemberships(station: Station | undefined) {
  if (station == null) {
    return [];
  }

  const seen = new Set<string>();
  return station.memberships.filter((membership) => {
    const key = `${membership.lineId}:${membership.code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
