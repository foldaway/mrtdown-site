import type { IntlShape } from 'react-intl';
import type { CrowdReportSource } from '~/util/crowdReportSource.functions';
import { getLocalizedTranslation } from './getLocalizedTranslation';

export function getCrowdReportDirectionLabel(
  source: Pick<CrowdReportSource, 'directionText' | 'directionStation'>,
  intl: IntlShape,
) {
  const direction = source.directionText?.trim();
  if (direction === 'not-sure') {
    return intl.formatMessage({
      id: 'report.direction_not_sure',
      defaultMessage: 'Not sure',
    });
  }
  if (direction?.startsWith('towards:')) {
    if (source.directionStation != null) {
      return intl.formatMessage(
        {
          id: 'report.direction_towards',
          defaultMessage: 'Towards {stationName}',
        },
        {
          stationName: getLocalizedTranslation(
            source.directionStation.name,
            intl.locale,
          ),
        },
      );
    }
  } else if (direction) {
    return direction;
  }
  return intl.formatMessage({
    id: 'community_report_source.not_provided',
    defaultMessage: 'Not provided',
  });
}
