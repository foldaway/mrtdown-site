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
        JSON.stringify([
          item.isLoop && directionViaId(item)
            ? null
            : item.destinationStationId,
          directionViaId(item),
        ]),
      ),
    ).size > 1;
  const hasDirection = timings.some(
    (item) => directionViaId(item) || item.destinationName,
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

function directionViaId(timing: ArrivalTiming) {
  return timing.viaStationId &&
    timing.viaStationName &&
    (timing.isLoop || timing.viaStationId !== timing.destinationStationId)
    ? timing.viaStationId
    : null;
}

type ArrivalDirectionProps = { timing: ArrivalTiming };

function ArrivalDirection({ timing }: ArrivalDirectionProps) {
  const viaId = directionViaId(timing);
  const via = viaId ? (
    <DirectionStation stationId={viaId} name={timing.viaStationName} />
  ) : null;
  const destination = timing.destinationName ? (
    <DirectionStation
      stationId={timing.destinationStationId}
      name={timing.destinationName}
    />
  ) : null;
  const viaLabel = via ? (
    <FormattedMessage
      id="station.arrivals.via"
      defaultMessage="via {station}"
      values={{ station: via }}
    />
  ) : null;
  if (timing.isLoop && viaLabel) return viaLabel;
  if (!destination) return viaLabel;
  return (
    <>
      <FormattedMessage
        id="station.arrivals.towards"
        defaultMessage="towards {station}"
        values={{ station: destination }}
      />
      {viaLabel && <> {viaLabel}</>}
    </>
  );
}

type DirectionStationProps = {
  stationId?: string | null;
  name?: ArrivalTiming['destinationName'];
};

function DirectionStation({ stationId, name }: DirectionStationProps) {
  const intl = useIntl();
  const label = name ? getLocalizedTranslation(name, intl.locale) : null;
  return label && stationId ? (
    <Link
      className="underline decoration-gray-400 underline-offset-2 hover:decoration-current dark:decoration-gray-500"
      params={{ stationId }}
      to="/{-$lang}/stations/$stationId"
    >
      {label}
    </Link>
  ) : (
    label
  );
}
