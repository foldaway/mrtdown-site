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

function serviceLabel(timing: ArrivalTiming, intl: IntlShape, compact = false) {
  if (compact && timing.serviceId === 'BPLRT_A') return 'A';
  if (compact && timing.serviceId === 'BPLRT_B') return 'B';
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
  const timings = [timing, ...additionalTimings];
  const distinctDirections =
    new Set(
      timings.map((item) =>
        item.isLoop && item.viaStationId && item.viaStationName
          ? `via:${item.viaStationId}`
          : `towards:${item.destinationStationId}`,
      ),
    ).size > 1;
  const hasDirection = timings.some(
    (item) => item.viaStationName || item.destinationName,
  );

  return (
    <>
      <p className="font-medium text-gray-800 text-sm leading-snug dark:text-gray-200">
        {serviceName}
      </p>
      {hasDirection && (
        <p className="text-gray-600 text-xs leading-snug dark:text-gray-400">
          {distinctDirections ? (
            timings.map((item, index) => (
              <span key={item.serviceId}>
                {index > 0 && ' · '}
                {serviceLabel(item, intl, true)}{' '}
                <ArrivalDirection timing={item} />
              </span>
            ))
          ) : (
            <ArrivalDirection timing={timing} />
          )}
        </p>
      )}
    </>
  );
}

type ArrivalDirectionProps = { timing: ArrivalTiming };

function ArrivalDirection({ timing }: ArrivalDirectionProps) {
  const intl = useIntl();
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

  if (!station) return null;
  return showVia ? (
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
  );
}
