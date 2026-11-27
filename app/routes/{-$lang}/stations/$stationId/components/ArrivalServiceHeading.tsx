import { Link } from '@tanstack/react-router';
import {
  defineMessages,
  FormattedMessage,
  type IntlShape,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { ArrivalTiming } from './stationGuide.types';

const shortServiceNames: Partial<Record<string, MessageDescriptor>> =
  defineMessages({
    EWL_MAIN_E: {
      id: 'station.arrivals.eastbound',
      defaultMessage: 'Eastbound',
    },
    EWL_MAIN_W: {
      id: 'station.arrivals.westbound',
      defaultMessage: 'Westbound',
    },
    CCL_LOOP_CW: {
      id: 'station.arrivals.clockwise',
      defaultMessage: 'Clockwise',
    },
    CCL_LOOP_CCW: {
      id: 'station.arrivals.anticlockwise',
      defaultMessage: 'Anticlockwise',
    },
  });

type ArrivalServiceHeadingProps = {
  timing: ArrivalTiming;
  additionalTimings?: ArrivalTiming[];
};

function serviceLabel(timing: ArrivalTiming, intl: IntlShape) {
  const shortName = Object.hasOwn(shortServiceNames, timing.serviceId)
    ? shortServiceNames[timing.serviceId]
    : undefined;
  return shortName
    ? intl.formatMessage(shortName)
    : getLocalizedTranslation(timing.serviceName, intl.locale);
}

export function ArrivalServiceHeading({
  timing,
  additionalTimings = [],
}: ArrivalServiceHeadingProps) {
  const intl = useIntl();
  const serviceName = intl.formatList(
    [
      ...new Set(
        [timing, ...additionalTimings].map((item) => serviceLabel(item, intl)),
      ),
    ],
    { type: 'conjunction' },
  );
  const showVia = timing.isLoop && timing.viaStationId && timing.viaStationName;
  const stationId = showVia ? timing.viaStationId : timing.destinationStationId;
  const stationTranslations = showVia
    ? timing.viaStationName
    : timing.destinationName;
  const name = stationTranslations
    ? getLocalizedTranslation(stationTranslations, intl.locale)
    : null;
  const station =
    name && stationId ? (
      <Link
        className="underline decoration-gray-400 underline-offset-2 hover:decoration-current dark:decoration-gray-500"
        params={{ stationId }}
        to="/{-$lang}/stations/$stationId"
      >
        {name}
      </Link>
    ) : (
      name
    );

  return (
    <>
      <p className="font-medium text-gray-800 text-sm leading-snug dark:text-gray-200">
        {serviceName}
      </p>
      {station && (
        <p className="text-gray-600 text-xs leading-snug dark:text-gray-400">
          {showVia ? (
            <FormattedMessage
              id="station.arrivals.via"
              defaultMessage="via {station}"
              values={{ station }}
            />
          ) : (
            <FormattedMessage
              id="station.arrivals.towards"
              defaultMessage="towards {station}"
              values={{ station }}
            />
          )}
        </p>
      )}
    </>
  );
}
