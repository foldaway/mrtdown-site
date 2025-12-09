import {
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  MapPinIcon,
} from '@heroicons/react/20/solid';
import classNames from 'classnames';
import { DropdownMenu } from 'radix-ui';
import { Fragment } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { IssueAffectedBranch } from '~/client';
import { useAffectedStations } from '~/components/IssueAffectedBranchPill/hooks/useAffectedStations';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

interface Props {
  branch: IssueAffectedBranch;
  className?: string;
}

export const IssueAffectedBranchPill: React.FC<Props> = (props) => {
  const { branch, className } = props;

  const intl = useIntl();
  const { lines } = useIncludedEntities();
  const { line, source, destination, allStations } =
    useAffectedStations(branch);

  const hasMultipleStations = allStations.length > 2;

  const renderStationRange = () => {
    if (source == null) return null;

    const sourceName =
      source.nameTranslations[intl.locale] ?? source.name ?? 'N/A';
    const destinationName =
      destination != null
        ? (destination.nameTranslations[intl.locale] ??
          destination.name ??
          'N/A')
        : null;

    if (destination) {
      return `${sourceName} ↔ ${destinationName}`;
    }

    return sourceName;
  };

  if (!hasMultipleStations) {
    return (
      <div
        className={classNames(
          'flex items-center gap-x-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs transition-all duration-200 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500 dark:hover:bg-gray-600',
          className,
        )}
        role="img"
        aria-label={`${line.id} line: ${renderStationRange()}`}
      >
        <span
          className="rounded-md px-2 py-1 font-bold text-white text-xs leading-none"
          style={{ backgroundColor: line.color }}
        >
          {line.id}
        </span>

        <div className="flex items-center gap-x-1">
          {source && (
            <Link
              to={buildLocaleAwareLink(`/stations/${source.id}`, intl.locale)}
              className="font-medium text-gray-700 text-xs transition-colors hover:underline dark:text-gray-200"
            >
              {source.nameTranslations[intl.locale] ?? source.name ?? 'N/A'}
            </Link>
          )}
          {destination != null && (
            <>
              <ArrowsRightLeftIcon className="size-3 text-gray-400" />
              <Link
                to={buildLocaleAwareLink(
                  `/stations/${destination.id}`,
                  intl.locale,
                )}
                className="font-medium text-gray-700 text-xs transition-colors hover:underline dark:text-gray-200"
              >
                {destination.nameTranslations[intl.locale] ?? destination.name}
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={classNames('relative', className)}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={classNames(
            'flex w-full cursor-pointer items-center gap-x-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs transition-all duration-200 hover:border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-gray-500 dark:hover:bg-gray-600',
          )}
          role="img"
          aria-label={`${line.id} line: ${renderStationRange()}`}
        >
          <span
            className="rounded-md px-2 py-1 font-bold text-white text-xs leading-none"
            style={{ backgroundColor: line.color }}
          >
            {line.id}
          </span>

          <div className="flex items-center gap-x-1">
            <span className="font-medium text-gray-700 text-xs dark:text-gray-200">
              {source?.nameTranslations[intl.locale] ?? source?.name ?? 'N/A'}
            </span>
            {destination != null && (
              <>
                <ArrowsRightLeftIcon className="size-3 text-gray-400" />
                <span className="font-medium text-gray-700 text-xs dark:text-gray-200">
                  {destination.nameTranslations[intl.locale] ??
                    destination.name}
                </span>
              </>
            )}
          </div>

          <div className="ml-auto">
            <ChevronDownIcon className="size-3 text-gray-400" />
          </div>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 max-h-80 w-72 overflow-hidden rounded border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
            sideOffset={4}
          >
            <div className="p-2">
              <div className="mb-2 flex items-center gap-1.5">
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
                <span className="font-medium text-gray-500 text-xs dark:text-gray-400">
                  <FormattedMessage
                    id="issue.affected_stations_schematic"
                    defaultMessage="Affected Stations ({count})"
                    values={{ count: allStations.length }}
                  />
                </span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto px-2 pb-2">
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
                            station.memberships.map((membership) => {
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
                                backgroundColor: lines[membership.lineId].color,
                              }}
                            >
                              <span className="font-bold text-white text-xs">
                                {membership.code}
                              </span>
                            </div>
                          ))}
                      </div>
                      <Link
                        to={buildLocaleAwareLink(
                          `/stations/${station.id}`,
                          intl.locale,
                        )}
                        className="group flex items-center gap-1"
                      >
                        <span className="text-gray-700 text-xs group-hover:underline dark:text-gray-300">
                          {station.nameTranslations[intl.locale] ??
                            station.name}
                        </span>
                      </Link>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
};
