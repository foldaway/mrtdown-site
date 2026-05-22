import type { LineSummary } from '~/types';

export function sortLineSummariesWithFutureServiceLast(
  lineSummaries: LineSummary[],
): LineSummary[] {
  return [...lineSummaries].sort((first, second) => {
    if (first.status === second.status) {
      return 0;
    }
    if (first.status === 'future_service') {
      return 1;
    }
    if (second.status === 'future_service') {
      return -1;
    }
    return 0;
  });
}
