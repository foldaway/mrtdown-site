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
        JSON.stringify([item.destinationStationId, directionViaId(item)]),
      ),
    ).size > 1;
  const hasDirection = timings.some(
    (item) => directionViaId(item) || item.destinationName,
  );
  const commonDestination =
    distinctDirections &&
    timings.every(
      (item) =>
        directionViaId(item) &&
        item.destinationName &&
        item.destinationStationId === timing.destinationStationId,
    );

  return (
    <>
      <p className="font-medium text-gray-800 text-sm leading-snug dark:text-gray-200">
        {serviceName}
      </p>
      {hasDirection && (
        <p className="text-gray-600 text-xs leading-snug dark:text-gray-400">
          {commonDestination && (
            <>
              <ArrivalDestination timing={timing} />
              {' · '}
            </>
          )}
          {distinctDirections ? (
            timings.map((item, index) => (
              <span key={item.serviceId}>
                {index > 0 && ' · '}
                {serviceLabel(item, intl, true)}{' '}
                <ArrivalDirection timing={item} viaOnly={commonDestination} />
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
    timing.viaStationId !== timing.destinationStationId
    ? timing.viaStationId
    : null;
}

type ArrivalDirectionProps = { timing: ArrivalTiming; viaOnly?: boolean };

function ArrivalDirection({ timing, viaOnly }: ArrivalDirectionProps) {
  const viaId = directionViaId(timing);
  const via = viaId ? (
    <DirectionStation stationId={viaId} name={timing.viaStationName} />
  ) : null;
  const viaLabel = via ? (
    <FormattedMessage
      id="station.arrivals.via"
      defaultMessage="via {station}"
      values={{ station: via }}
    />
  ) : null;
  if (viaOnly) return viaLabel;
  if (!timing.destinationName) return viaLabel;
  return (
    <>
      <ArrivalDestination timing={timing} />
      {viaLabel && <> {viaLabel}</>}
    </>
  );
}

type ArrivalDestinationProps = { timing: ArrivalTiming };

function ArrivalDestination({ timing }: ArrivalDestinationProps) {
  return (
    <FormattedMessage
      id="station.arrivals.towards"
      defaultMessage="towards {station}"
      values={{
        station: (
          <DirectionStation
            stationId={timing.destinationStationId}
            name={timing.destinationName}
          />
        ),
      }}
    />
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
