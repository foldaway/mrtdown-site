import { Popover } from '@base-ui/react/popover';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { BetaBadge } from '~/components/BetaBadge';
import type { Station } from '~/types';
import { groupArrivalSummaries } from './groupArrivalSummaries';
import { ServiceArrivalSummary } from './PlatformArrivalSummary';
import { ExitSign } from './StationGuideSigns';
import { StationLineFacts } from './StationLineFacts';
import { arrivalBranchKey } from './stationArrivalRefresh';
import type { ArrivalLine, StationExit } from './stationGuide.types';
import { TimetableSources } from './TimetableSources';
import { useHoverPopover } from './useHoverPopover';
import { useStationArrivals } from './useStationArrivals';

type StationGuideProps = {
  arrivalLines: ArrivalLine[];
  exits: StationExit[];
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
  memberships: Station['memberships'];
  referenceAt: string;
  stationId: string;
  visibleMemberships: Station['memberships'];
};

export function StationGuide({
  arrivalLines,
  exits,
  lineColors,
  lineNames,
  memberships,
  referenceAt,
  stationId,
  visibleMemberships,
}: StationGuideProps) {
  const { states, refreshAfterReport } = useStationArrivals(
    stationId,
    arrivalLines,
  );
  const [now, setNow] = useState<number | null>(null);
  const hasArrivals = arrivalLines.length > 0;
  const sections = useMemo(() => {
    const arrivals = new Map(arrivalLines.map((line) => [line.lineId, line]));
    const membershipLineIds = memberships.map(({ lineId }) => lineId);
    const visibleKeys = new Set(
      visibleMemberships.map(({ lineId, code }) => `${lineId}:${code}`),
    );
    return [...new Set([...arrivals.keys(), ...membershipLineIds])].map(
      (lineId) => {
        const lineMemberships = memberships.filter(
          (membership) => membership.lineId === lineId,
        );
        return {
          lineId,
          timings: arrivals.get(lineId)?.arrivalTimings ?? [],
          facts: lineMemberships.map((membership) => ({
            membership,
            showCode:
              lineMemberships.length > 1 ||
              !visibleKeys.has(`${lineId}:${membership.code}`),
          })),
        };
      },
    );
  }, [arrivalLines, memberships, visibleMemberships]);

  useEffect(() => {
    if (!hasArrivals) return;
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 15_000);
    return () => window.clearInterval(interval);
  }, [hasArrivals]);

  return (
    <section
      aria-labelledby="station-guide-title"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <h2
          id="station-guide-title"
          className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
        >
          <FormattedMessage
            id="station.guide.title"
            defaultMessage="Station guide"
          />
        </h2>
        {hasArrivals && <ArrivalInfo />}
      </div>
      {sections.length > 0 && (
        <div className="space-y-3 px-4 pb-3 sm:px-6">
          {sections.map(({ lineId, timings, facts }) => (
            <section
              aria-labelledby={`station-guide-line-${lineId}`}
              className="border-s-3 ps-2.5 sm:ps-3"
              key={lineId}
              style={{ borderInlineStartColor: lineColors[lineId] }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pb-1.5">
                <h3
                  className="font-semibold text-gray-900 text-sm dark:text-gray-100"
                  id={`station-guide-line-${lineId}`}
                >
                  <Link
                    className="hover:underline"
                    params={{ lineId }}
                    to="/{-$lang}/lines/$lineId"
                  >
                    {lineNames[lineId] ?? lineId}
                  </Link>
                </h3>
                <StationLineFacts facts={facts} referenceAt={referenceAt} />
              </div>
              {timings.length > 0 && (
                <ul className="divide-y divide-gray-200 border-gray-200 border-t dark:divide-gray-700 dark:border-gray-700">
                  {groupArrivalSummaries(timings, states, now).map(
                    (members) => {
                      const [first, ...sharedArrivals] = members;
                      const key = JSON.stringify(
                        members.map(({ arrivalTiming }) =>
                          arrivalBranchKey(
                            lineId,
                            arrivalTiming.serviceId,
                            arrivalTiming.destinationStationId,
                          ),
                        ),
                      );
                      const platformKey =
                        first.arrivalState?.data?.source === 'scheduled'
                          ? first.arrivalState.data.timings
                              .flatMap((timing) =>
                                timing.platforms.map(({ id }) => id),
                              )
                              .sort()
                          : [];
                      return (
                        <ServiceArrivalSummary
                          {...first}
                          sharedArrivals={sharedArrivals}
                          key={JSON.stringify([key, platformKey])}
                          lineColor={lineColors[lineId]}
                          now={now}
                          onArrivalReported={refreshAfterReport}
                        />
                      );
                    },
                  )}
                </ul>
              )}
            </section>
          ))}
          {hasArrivals && (
            <p className="text-gray-600 text-xs dark:text-gray-400">
              <FormattedMessage
                id="station.arrivals.schedule_note"
                defaultMessage="Scheduled times · ≈ Approximate · Check station displays for live times"
              />
            </p>
          )}
        </div>
      )}
      {hasArrivals && <TimetableSources states={states} />}
      {exits.length > 0 && (
        <div className="border-gray-200 border-t dark:border-gray-700">
          <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
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

function ArrivalInfo() {
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
                  id="station.arrivals.explainer_label"
                  defaultMessage="How arrivals work"
                />
              </p>
              <BetaBadge />
            </div>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              <FormattedMessage
                id="station.arrivals.explainer"
                defaultMessage="Times come from a published timetable. Approximate scheduled times are less precise, and timetables may be incomplete. Check station displays for live times."
              />
            </p>
            <Popover.Arrow className="fill-white dark:fill-gray-800" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
