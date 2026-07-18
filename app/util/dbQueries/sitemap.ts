import { getCompleteDataset } from './dataset';
import { isoDate, nowSg, parseDateTime } from './dateTime';

export async function getSitemapData() {
  const dataset = await getCompleteDataset();
  const skippedIssueIds: string[] = [];
  const issuesWithFirstDates = Object.values(dataset.allIssues).flatMap(
    (issue) => {
      const firstInterval = issue.intervals[0];
      if (firstInterval == null) {
        return [];
      }

      const firstDate = parseDateTime(firstInterval.startAt);
      if (!firstDate.isValid) {
        skippedIssueIds.push(issue.id);
        return [];
      }

      return [{ firstDate, issue }];
    },
  );
  const firstDates = issuesWithFirstDates.map(({ firstDate }) => firstDate);
  const earliest = firstDates.sort((a, b) => a.toMillis() - b.toMillis())[0];
  const latest = firstDates.sort((a, b) => b.toMillis() - a.toMillis())[0];

  const monthEarliest =
    earliest != null ? isoDate(earliest.startOf('month')) : isoDate(nowSg());
  const monthLatest =
    latest != null ? isoDate(latest.startOf('month')) : isoDate(nowSg());
  if (skippedIssueIds.length > 0) {
    console.warn('[SITEMAP] Skipped issues with invalid first interval dates', {
      count: skippedIssueIds.length,
      issueIds: skippedIssueIds.slice(0, 20),
    });
  }

  return {
    lineIds: Object.keys(dataset.included.lines).sort(),
    stationIds: Object.keys(dataset.included.stations).sort(),
    townIds: Object.keys(dataset.included.towns).sort(),
    operatorIds: Object.keys(dataset.included.operators).sort(),
    issueIds: issuesWithFirstDates.map(({ issue }) => issue.id),
    monthEarliest,
    monthLatest,
    currentDate: isoDate(nowSg()),
  };
}
