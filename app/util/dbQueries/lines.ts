import { countLineStations } from '~/util/lineBranches';
import {
  type CommunitySignalOptions,
  getPageCommunitySignals,
} from './communitySignals';
import { getBaseDataset } from './dataset';
import { isoDate, nowSg, parseDateTime } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import {
  buildIssueCountGraphs,
  buildLineSummary,
  buildUptimeGraph,
  rankLineSummaries,
} from './lineAnalytics';

export async function getLinesDirectoryData(days: number) {
  const dataset = await getBaseDataset();
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const lines = Object.values(dataset.included.lines);
  const summaries = rankLineSummaries(
    lines.map((line) =>
      buildLineSummary(
        line,
        dataset.issuesByLineId[line.id] ?? [],
        days,
        dataset.publicHolidaySet,
        referenceNow,
      ),
    ),
  );
  const summariesByLineId = Object.fromEntries(
    summaries.map((summary) => [summary.lineId, summary]),
  );

  const entries = lines.map((line) => {
    const summary = summariesByLineId[line.id];
    if (summary == null) {
      throw new Error(`Line summary missing for ${line.id}`);
    }
    const operationalState =
      line.startedAt == null || line.startedAt > referenceDate
        ? 'future'
        : 'current';

    return {
      lineId: line.id,
      status: summary.status,
      stationCount: countLineStations(dataset.included.stations, line.id, {
        includePlanned: operationalState === 'future',
        referenceDate,
      }),
      operatorIds: [
        ...new Set(
          line.operators
            .filter(
              (operator) =>
                operator.endedAt == null || operator.endedAt > referenceDate,
            )
            .map((operator) => operator.operatorId),
        ),
      ],
      openingDate: line.startedAt,
      type: line.type,
      uptimeRatio: summary.uptimeRatio,
      uptimeRank: summary.uptimeRank,
      operationalState,
    };
  });

  return {
    data: {
      dateCount: days,
      referenceDate,
      lines: entries,
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [],
      lineIds: entries.map((entry) => entry.lineId),
      operatorIds: entries.flatMap((entry) => entry.operatorIds),
    }),
  };
}

export async function getLineProfileData(
  lineId: string,
  days: number,
  options: CommunitySignalOptions = {},
) {
  const dataset = await getBaseDataset();
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const line = dataset.included.lines[lineId];
  if (line == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const allLineSummaries = rankLineSummaries(
    Object.values(dataset.included.lines).map((candidateLine) => {
      const candidateIssues = dataset.issuesByLineId[candidateLine.id] ?? [];
      return buildLineSummary(
        candidateLine,
        candidateIssues,
        days,
        dataset.publicHolidaySet,
      );
    }),
  );

  const lineIssues = dataset.issuesByLineId[lineId] ?? [];
  const rankedSummary = allLineSummaries.find(
    (summary) => summary.lineId === lineId,
  );
  if (rankedSummary == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }
  const issueIdsRecent = [...lineIssues]
    .filter((issue) =>
      issue.intervals.some(
        (interval) => parseDateTime(interval.startAt) <= nowSg(),
      ),
    )
    .sort((a, b) => {
      const earliestA = Math.min(
        ...a.intervals.map((interval) =>
          parseDateTime(interval.startAt).toMillis(),
        ),
      );
      const earliestB = Math.min(
        ...b.intervals.map((interval) =>
          parseDateTime(interval.startAt).toMillis(),
        ),
      );
      return earliestB - earliestA;
    })
    .slice(0, 5)
    .map((issue) => issue.id);

  const futureMaintenance = lineIssues
    .filter((issue) => issue.type === 'maintenance')
    .flatMap((issue) =>
      issue.intervals
        .filter((interval) => interval.status === 'future')
        .map((interval) => ({ issueId: issue.id, startAt: interval.startAt })),
    )
    .sort(
      (a, b) =>
        parseDateTime(a.startAt).toMillis() -
        parseDateTime(b.startAt).toMillis(),
    )[0];
  const includePlannedStations =
    line.startedAt == null || parseDateTime(line.startedAt) > referenceNow;
  const branches = dataset.branchesByLineId[lineId] ?? [];
  const stationCount = countLineStations(dataset.included.stations, lineId, {
    includePlanned: includePlannedStations,
    referenceDate,
  });

  const stationIdsInterchanges = [
    ...new Set(
      Object.values(dataset.included.stations)
        .filter((station) => {
          const lineMemberships = station.memberships.filter(
            (membership) => membership.lineId === lineId,
          );
          if (lineMemberships.length === 0) {
            return false;
          }

          return station.memberships.some(
            (membership) => membership.lineId !== lineId,
          );
        })
        .map((station) => station.id),
    ),
  ];

  const profile = {
    lineId,
    referenceDate,
    lineSummary: rankedSummary,
    branches,
    stationCount,
    issueIdNextMaintenance: futureMaintenance?.issueId ?? null,
    issueIdsRecent,
    issueCountByType: pickIssueTypes(lineIssues),
    timeScaleGraphsIssueCount: buildIssueCountGraphs(lineIssues),
    timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
      buildUptimeGraph(line, lineIssues, dataset.publicHolidaySet, window),
    ),
    stationIdsInterchanges,
    communitySignals: await getPageCommunitySignals(options, { lineId }),
  };
  const profileIssueIds = [
    ...new Set(
      [...issueIdsRecent, profile.issueIdNextMaintenance].filter(
        (value): value is string => value != null,
      ),
    ),
  ];

  return {
    data: profile,
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: profileIssueIds,
      lineIds: [lineId],
      stationIds: Object.keys(dataset.included.stations),
      operatorIds: line.operators.map((operator) => operator.operatorId),
      includeStationMembershipLines: true,
    }),
  };
}

export type LineBranch = Awaited<
  ReturnType<typeof getLineProfileData>
>['data']['branches'][number];
