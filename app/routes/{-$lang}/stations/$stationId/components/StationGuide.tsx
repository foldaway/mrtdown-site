import { Popover } from '@base-ui/react/popover';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { BetaBadge } from '~/components/BetaBadge';
import { getStationArrivalLinesFn } from '~/util/station.functions';
import { ServiceArrivalSummary } from './PlatformArrivalSummary';
import { ExitSign } from './StationGuideSigns';
import type { ArrivalLine, StationExit } from './stationGuide.types';
import { useHoverPopover } from './useHoverPopover';

type StationGuideProps = {
  arrivalLines: ArrivalLine[];
  exits: StationExit[];
  isHydrated: boolean;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
  stationId: string;
};

export function StationGuide({
  arrivalLines,
  exits,
  isHydrated,
  lineColors,
  lineNames,
  stationId,
}: StationGuideProps) {
  const [liveArrivalLines, setLiveArrivalLines] = useState(arrivalLines);

  const refreshArrivalLines = useCallback(async () => {
    try {
      const nextArrivalLines = await getStationArrivalLinesFn({
        data: { stationId },
      });
      setLiveArrivalLines(nextArrivalLines);
    } catch {
      // Keep the latest available estimates when the refresh is unavailable.
    }
  }, [stationId]);

  useEffect(() => {
    void refreshArrivalLines();
    const interval = window.setInterval(
      () => void refreshArrivalLines(),
      30_000,
    );
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshArrivalLines]);

  return (
    <section
      aria-labelledby="station-guide-title"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
        <h2
          id="station-guide-title"
          className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
        >
          <FormattedMessage
            id="station.guide.title"
            defaultMessage="Station guide"
          />
        </h2>
        <ArrivalEstimatorInfo />
      </div>
      {liveArrivalLines.length > 0 && (
        <section
          aria-labelledby="station-arrivals-title"
          className="border-gray-200 border-t dark:border-gray-700"
        >
          <h3 className="sr-only" id="station-arrivals-title">
            <FormattedMessage
              id="station.arrival_timings.title"
              defaultMessage="Estimated arrivals"
            />
          </h3>
          {liveArrivalLines.map((line) => (
            <section
              aria-labelledby={`arrival-line-${line.lineId}`}
              className="border-gray-200 border-t dark:border-gray-700"
              key={line.lineId}
            >
              <h4
                className="flex items-center gap-2 px-4 pt-2.5 font-semibold text-gray-900 text-sm sm:px-6 dark:text-gray-100"
                id={`arrival-line-${line.lineId}`}
              >
                <Link
                  className="group flex items-center gap-2"
                  params={{ lineId: line.lineId }}
                  to="/{-$lang}/lines/$lineId"
                >
                  <span
                    className="shrink-0 rounded-sm px-2 py-1 font-semibold text-white text-xs leading-none"
                    style={{ backgroundColor: lineColors[line.lineId] }}
                  >
                    {line.lineId}
                  </span>
                  <span className="group-hover:underline">
                    {lineNames[line.lineId] ?? line.lineId}
                  </span>
                </Link>
              </h4>
              <ul className="mt-1 divide-y divide-gray-200 dark:divide-gray-700">
                {line.arrivalTimings.map((arrivalTiming) => (
                  <ServiceArrivalSummary
                    arrivalTiming={arrivalTiming}
                    isHydrated={isHydrated}
                    key={arrivalTiming.serviceId}
                    lineColor={lineColors[line.lineId]}
                    onArrivalReportSubmitted={refreshArrivalLines}
                    stationId={stationId}
                  />
                ))}
              </ul>
            </section>
          ))}
        </section>
      )}
      {exits.length > 0 && (
        <div className="border-gray-200 border-t dark:border-gray-700">
          <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
            <h3
              className="shrink-0 font-semibold text-gray-700 text-xs uppercase tracking-wide dark:text-gray-300"
              id="station-exits-title"
            >
              <FormattedMessage
                id="station.guide.exits"
                defaultMessage="Exits"
              />
            </h3>
            <ul
              aria-labelledby="station-exits-title"
              className="flex flex-wrap gap-1.5"
            >
              {exits.map((exit) => (
                <li key={exit.id}>
                  <ExitSign label={exit.label} />
                  <span className="sr-only">
                    <FormattedMessage
                      id="station.guide.exit"
                      defaultMessage="Exit {label}"
                      values={{ label: exit.label }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function ArrivalEstimatorInfo() {
  const { closeAfterHover, isOpen, openOnHover, setIsOpen } = useHoverPopover();

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        render={
          <button
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-gray-500 text-xs transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            onMouseEnter={openOnHover}
            onMouseLeave={closeAfterHover}
            type="button"
          />
        }
      >
        <InformationCircleIcon aria-hidden={true} className="size-5" />
        <FormattedMessage
          id="station.arrival_timings.info_label"
          defaultMessage="About arrivals"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          collisionPadding={16}
          onMouseEnter={openOnHover}
          onMouseLeave={closeAfterHover}
          side="bottom"
          sideOffset={8}
        >
          <Popover.Popup className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-700 text-xs leading-5 shadow-gray-900/15 shadow-xl outline-none ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:shadow-black/30 dark:ring-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">
                <FormattedMessage
                  id="station.arrival_timings.explainer_label"
                  defaultMessage="How estimated arrivals work"
                />
              </p>
              <BetaBadge />
            </div>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              <FormattedMessage
                id="station.arrival_timings.explainer"
                defaultMessage="Calculated from the station's published first and last train times and representative frequency. These are planning estimates, not live train-tracking predictions. Open a service's details for its typical headway and published range."
              />
            </p>
            <Popover.Arrow className="fill-white dark:fill-gray-800" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
