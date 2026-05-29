import type { LineSummary } from '~/types';

export function sortLineSummariesWithFutureServiceLast(
  lineSummaries: LineSummary[],
): LineSummary[] {
  return [...lineSummaries].sort((first, second) => {
    const firstIsFuture = first.status === 'future_service';
    const secondIsFuture = second.status === 'future_service';

    if (firstIsFuture && !secondIsFuture) {
      return 1;
    }
    if (!firstIsFuture && secondIsFuture) {
      return -1;
    }

    return first.lineId.localeCompare(second.lineId);
  });
}
