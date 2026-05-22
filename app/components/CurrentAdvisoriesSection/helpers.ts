import type { LineSummary } from '~/types';

type AdvisoryLineSummary = Pick<LineSummary, 'lineId' | 'status'>;

export function countOperationalLineSummaries({
  lineSummaries,
}: {
  lineSummaries: AdvisoryLineSummary[];
}) {
  return lineSummaries.filter((lineSummary) => lineSummary.status === 'normal')
    .length;
}
