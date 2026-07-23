import { ArrowRightIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { Menu as DropdownMenu } from '@base-ui/react/menu';
import { Fragment } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { Issue, IssueAffectedBranch, IssueInterval } from '~/types';
import { useAffectedStations } from '~/components/IssueAffectedBranchPill/hooks/useAffectedStations';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { isStationMembershipVisibleAt } from '~/helpers/isStationMembershipVisibleAt';

interface Props {
  branch: IssueAffectedBranch;
  className?: string;
  issue: Pick<Issue, 'intervals'>;
  interval?: IssueInterval;
}

/**
 * Renders an affected branch and its station popup. Station codes are resolved
 * at the selected issue interval, or at the issue's earliest interval when no
 * specific interval is selected, so historical issues retain their valid codes.
 */
export const IssueAffectedBranchPill: React.FC<Props> = (props) => {
  const { branch, className, interval, issue } = props;

  const intl = useIntl();
  const { lines } = useIncludedEntities();
  const membershipReferenceAt =
    interval?.startAt ??
    issue.intervals.reduce<string | null>((earliest, candidate) => {
      if (earliest == null) {
        return candidate.startAt;
      }

      return DateTime.fromISO(candidate.startAt).toMillis() <
        DateTime.fromISO(earliest).toMillis()
        ? candidate.startAt
        : earliest;
    }, null);
  const { line, source, destination, allStations } = useAffectedStations(
    branch,
    membershipReferenceAt,
  );
  const serviceName =
    branch.serviceName != null
      ? getLocalizedTranslation(branch.serviceName, intl.locale)
      : null;
  const isWholeService = branch.wholeServiceRevisions != null;

  const hasMultipleStations = allStations.length > 2;

  const renderStationRange = () => {
    if (source == null) return null;

    const sourceName = getLocalizedTranslation(source.name, intl.locale);
    const destinationName =
      destination != null
        ? getLocalizedTranslation(destination.name, intl.locale)
        : null;

    if (destination) {
      return `${sourceName} → ${destinationName}`;
    }

    return sourceName;
  };

  const stationRange = renderStationRange();

  const renderStationRangeLinks = () => (
    <div className="flex min-w-0 items-center gap-x-1">
      {source && (
        <Link
          to="/{-$lang}/stations/$stationId"
          params={{ stationId: source.id }}
          className="truncate font-semibold text-gray-800 text-xs transition-colors hover:underline dark:text-gray-100"
        >
          {getLocalizedTranslation(source.name, intl.locale)}
        </Link>
      )}
      {destination != null && (
        <>
          <ArrowRightIcon className="size-3 shrink-0 text-gray-500" />
          <Link
            to="/{-$lang}/stations/$stationId"
            params={{ stationId: destination.id }}
            className="truncate font-semibold text-gray-800 text-xs transition-colors hover:underline dark:text-gray-100"
          >
            {getLocalizedTranslation(destination.name, intl.locale)}
          </Link>
        </>
      )}
    </div>
  );

  const renderServiceContext = () => {
    if (serviceName == null && !isWholeService) {
      return null;
    }

    return (
      <div className="flex min-w-0 items-center gap-1.5">
        {serviceName != null && (
          <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            {serviceName}
          </span>
        )}
        {isWholeService && (
          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 font-semibold text-[9px] text-blue-700 uppercase tracking-wide dark:bg-blue-900/40 dark:text-blue-300">
            <FormattedMessage
              id="issue.whole_service_badge"
              defaultMessage="Whole service"
            />
          </span>
        )}
      </div>
    );
  };

  if (!hasMultipleStations) {
    return (
      <div
        className={classNames(
          'flex min-w-0 items-center gap-x-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs transition-all duration-200 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500 dark:hover:bg-gray-600',
          className,
        )}
      >
        <span
          className="rounded-md px-2 py-1 font-bold text-white text-xs leading-none"
          style={{ backgroundColor: line.color }}
        >
          {line.id}
        </span>

        <div className="flex min-w-0 flex-col">
          {renderStationRangeLinks()}
          {renderServiceContext()}
        </div>
      </div>
    );
  }

  return (
    <div className={classNames('relative', className)}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={classNames(
            'flex w-full cursor-pointer items-center gap-x-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-left text-xs transition-all duration-200 hover:border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500 dark:hover:bg-gray-600',
          )}
        >
          <span
            className="rounded-md px-2 py-1 font-bold text-white text-xs leading-none"
            style={{ backgroundColor: line.color }}
          >
            {line.id}
          </span>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-x-1 font-semibold text-gray-800 text-xs dark:text-gray-100">
              <span className="truncate">
                {source != null
                  ? getLocalizedTranslation(source.name, intl.locale)
                  : 'N/A'}
              </span>
              {destination != null && (
                <>
                  <ArrowRightIcon className="size-3 shrink-0 text-gray-500" />
                  <span className="truncate">
                    {getLocalizedTranslation(destination.name, intl.locale)}
                  </span>
                </>
              )}
            </span>
            {renderServiceContext()}
          </div>

          <div className="ml-auto">
            <ChevronDownIcon className="size-3 text-gray-400" />
          </div>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Positioner sideOffset={6} collisionPadding={8}>
            <DropdownMenu.Popup className="z-50 flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
              <div className="shrink-0 border-gray-200 border-b bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-2.5">
                  <span
                    className="rounded-md px-2 py-1 font-bold text-white text-xs leading-none"
                    style={{ backgroundColor: line.color }}
                  >
                    {line.id}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900 text-xs dark:text-gray-100">
                      {getLocalizedTranslation(line.name, intl.locale)}
                    </p>
                    {serviceName != null && (
                      <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                        {serviceName}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 p-3 pb-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/30">
                  <p className="font-medium text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
                    <FormattedMessage
                      id="issue.service_coverage"
                      defaultMessage="Service coverage"
                    />
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-gray-800 text-xs dark:text-gray-200">
                      {isWholeService ? (
                        <FormattedMessage
                          id="issue.entire_service"
                          defaultMessage="Entire service"
                        />
                      ) : (
                        stationRange
                      )}
                    </p>
                    <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-medium text-[10px] text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700">
                      <FormattedMessage
                        id="issue.station_count"
                        defaultMessage="{count, plural, one {# station} other {# stations}}"
                        values={{ count: allStations.length }}
                      />
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 px-0.5">
                  <div
                    className="size-2 rounded-full"
                    style={{ backgroundColor: line.color }}
                  />
                  <span className="font-semibold text-gray-600 text-xs dark:text-gray-300">
                    {isWholeService ? (
                      <FormattedMessage
                        id="issue.stations_on_service"
                        defaultMessage="Stations on this service"
                      />
                    ) : (
                      <FormattedMessage
                        id="general.affected_stations"
                        defaultMessage="Affected stations"
                      />
                    )}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                <div className="grid grid-cols-[auto_1fr] gap-x-2">
                  {allStations.map((station, index) => (
                    <Fragment key={station.id}>
                      <div className="relative flex h-8 items-center justify-center">
                        <div
                          className="z-20 size-3 rounded-full border-2 bg-white"
                          style={{ borderColor: line.color }}
                        />
                        <div
                          className={classNames(
                            '-translate-x-1/2 absolute left-1/2 z-10 w-1',
                            {
                              'top-1/2 bottom-0': index === 0,
                              'top-0 bottom-1/2':
                                index === allStations.length - 1,
                              'top-0 bottom-0':
                                index > 0 && index < allStations.length - 1,
                            },
                          )}
                          style={{ backgroundColor: line.color }}
                        />
                      </div>

                      <div className="flex min-h-8 items-center gap-1.5">
                        <div className="flex items-center overflow-hidden rounded">
                          {Object.entries(
                            Object.fromEntries(
                              station.memberships
                                .filter((membership) => {
                                  if (membershipReferenceAt == null) {
                                    return false;
                                  }

                                  return isStationMembershipVisibleAt(
                                    membership,
                                    membershipReferenceAt,
                                  );
                                })
                                .map((membership) => {
                                  const key = `${membership.code}@${membership.lineId}`;
                                  return [key, membership];
                                }),
                            ),
                          )
                            .sort((a, b) => {
                              if (a[1].lineId === line.id) return -1;
                              if (b[1].lineId === line.id) return 1;
                              return 0;
                            })
                            .map(([key, membership]) => (
                              <div
                                key={key}
                                className="flex h-4 w-10 items-center justify-center px-1"
                                style={{
                                  backgroundColor:
                                    lines[membership.lineId].color,
                                }}
                              >
                                <span className="font-bold text-white text-xs">
                                  {membership.code}
                                </span>
                              </div>
                            ))}
                        </div>
                        <Link
                          to="/{-$lang}/stations/$stationId"
                          params={{ stationId: station.id }}
                          className="group flex items-center gap-1"
                        >
                          <span className="text-gray-700 text-xs group-hover:underline dark:text-gray-300">
                            {getLocalizedTranslation(station.name, intl.locale)}
                          </span>
                        </Link>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </DropdownMenu.Popup>
          </DropdownMenu.Positioner>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
};
