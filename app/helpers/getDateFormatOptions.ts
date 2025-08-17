import type { Granularity } from '~/client';

export function getDateFormatOptions(
  granularity: Granularity,
): Partial<Intl.DateTimeFormatOptions> {
  switch (granularity) {
    case 'day': {
      return {
        day: 'numeric',
        month: 'short',
      };
    }
    case 'month': {
      return {
        month: 'short',
      };
    }
    default: {
      return {
        [granularity]: 'numeric',
      };
    }
  }
}
