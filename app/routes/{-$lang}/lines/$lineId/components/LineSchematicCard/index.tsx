import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DropdownMenu } from 'radix-ui';
import { Fragment, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { LineBranch } from '~/util/db.queries';
import type { Line } from '~/types';
import { BranchItem } from './components/BranchItem';

interface Props {
  line: Line;
  branches: LineBranch[];
}

export const LineSchematicCard: React.FC<Props> = (props) => {
  const { line, branches } = props;

  const intl = useIntl();
  const { lines, stations } = useIncludedEntities();

  const [selectedBranchId, setSelectedBranchId] = useState(
    branches[0]?.id ?? null,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedBranch = useMemo(() => {
    return branches.find((branch) => branch.id === selectedBranchId) ?? null;
  }, [branches, selectedBranchId]);

  const loopColumns = useMemo(() => {
    if (selectedBranch == null) {
      return { bottomStationId: null, leftStationIds: [], rightStationIds: [] };
    }

    const hasBottomStation = selectedBranch.stationIds.length % 2 === 1;
    const sideCount = Math.floor(selectedBranch.stationIds.length / 2);
    const rightStartIndex = hasBottomStation ? sideCount + 1 : sideCount;

    return {
      bottomStationId: hasBottomStation
        ? selectedBranch.stationIds[sideCount]
        : null,
      leftStationIds: selectedBranch.stationIds.slice(0, sideCount),
      rightStationIds: selectedBranch.stationIds
        .slice(rightStartIndex)
        .reverse(),
    };
  }, [selectedBranch]);

  const rowCount = Math.max(
    loopColumns.leftStationIds.length,
    loopColumns.rightStationIds.length,
  );

  const renderCodePills = (stationId: string) => (
    <div className="flex shrink-0 items-center overflow-hidden rounded-md">
      {Object.entries(
        Object.fromEntries(
          stations[stationId].memberships.map((membership) => {
            const key = `${membership.code}@${membership.lineId}`;
            return [key, membership];
          }),
        ),
      )
        .sort((a, b) => {
          if (a[1].lineId === line.id) {
            return -1;
          }
          if (b[1].lineId === line.id) {
            return 1;
          }
          return 0;
        })
        .map(([key, membership]) => (
          <div
            key={key}
            className="z-10 flex h-4 w-10 items-center justify-center px-1.5"
            style={{
              backgroundColor: lines[membership.lineId].color,
            }}
          >
            <span className="font-semibold text-white text-xs leading-none">
              {membership.code}
            </span>
          </div>
        ))}
    </div>
  );

  const renderStationLabel = (stationId: string, side: 'left' | 'right') => {
    const stationName = getLocalizedTranslation(
      stations[stationId].name,
      intl.locale,
    );

    return (
      <div
        className={classNames('flex w-full items-center gap-x-2', {
          'justify-end text-right': side === 'left',
        })}
      >
        {side === 'left' && (
          <>
            <Link
              to="/{-$lang}/stations/$stationId"
              params={{ stationId }}
              className="group min-w-0"
            >
              <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                {stationName}
              </span>
            </Link>
            {renderCodePills(stationId)}
          </>
        )}
        {side === 'right' && (
          <>
            {renderCodePills(stationId)}
            <Link
              to="/{-$lang}/stations/$stationId"
              params={{ stationId }}
              className="group min-w-0"
            >
              <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                {stationName}
              </span>
            </Link>
          </>
        )}
      </div>
    );
  };

  const renderBottomStationLabel = (stationId: string) => {
    const stationName = getLocalizedTranslation(
      stations[stationId].name,
      intl.locale,
    );

    return (
      <div className="flex flex-col items-center gap-y-1 text-center">
        {renderCodePills(stationId)}
        <Link
          to="/{-$lang}/stations/$stationId"
          params={{ stationId }}
          className="group min-w-0"
        >
          <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
            {stationName}
          </span>
        </Link>
      </div>
    );
  };

  const renderLoopRailMarker = (index: number, hasStation: boolean) => (
    <div className="relative flex h-14 items-center justify-center">
      <div
        className={classNames('-translate-x-1/2 absolute left-1/2 z-10 w-1', {
          'top-1/2 bottom-0': index === 0 && hasStation,
          'top-0 bottom-0': index > 0 || !hasStation,
        })}
        style={{
          backgroundColor: line.color,
        }}
      />
      {hasStation && (
        <div
          className="z-20 size-4 rounded-full border-4 bg-white dark:bg-gray-900"
          style={{
            borderColor: line.color,
          }}
        />
      )}
    </div>
  );

  const renderStraightRailMarker = (index: number, total: number) => (
    <div className="relative flex h-12 items-center justify-center">
      <div
        className="z-20 size-4 rounded-full border-4 bg-white dark:bg-gray-900"
        style={{
          borderColor: line.color,
        }}
      />
      <div
        className={classNames('-translate-x-1/2 absolute left-1/2 z-10 w-1', {
          'top-1/2 bottom-0': index === 0,
          'top-0 bottom-1/2': index === total - 1,
          'top-0 bottom-0': index > 0 && index < total - 1,
        })}
        style={{
          backgroundColor: line.color,
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col self-start rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-8 md:row-span-2 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.line_schematic"
          defaultMessage="Line Schematic"
        />
      </span>
      <div className="mt-2 min-w-64 md:self-start">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-1 text-left font-medium text-gray-900 text-sm shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
            <span>
              {selectedBranch != null ? (
                <BranchItem branch={selectedBranch} />
              ) : (
                <FormattedMessage
                  id="general.select_branch"
                  defaultMessage="Select Branch"
                />
              )}
            </span>
            <ChevronDownIcon className="ml-2 h-5 w-5 text-gray-400" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
              sideOffset={5}
            >
              {branches.map((branch) => (
                <DropdownMenu.Item
                  key={branch.id}
                  className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-900 dark:text-gray-100 dark:data-[state=checked]:bg-blue-900 dark:data-[state=checked]:text-blue-100 dark:focus:bg-gray-700 dark:hover:bg-gray-700"
                  onSelect={() => {
                    setSelectedBranchId(branch.id);
                  }}
                >
                  <BranchItem branch={branch} />
                  {selectedBranchId === branch.id && (
                    <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {selectedBranch != null && (
        <div className="flex flex-col">
          <div
            className={classNames(
              'relative mt-4 overflow-hidden transition-all duration-300 md:overflow-visible',
              {
                'max-h-96 md:max-h-none': !isExpanded,
                'max-h-none': isExpanded,
              },
            )}
          >
            <div className="md:hidden">
              <div
                key={`${selectedBranchId}-mobile`}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3"
              >
                {selectedBranch.stationIds.map((stationId, index) => (
                  <Fragment key={stationId}>
                    {renderStraightRailMarker(
                      index,
                      selectedBranch.stationIds.length,
                    )}
                    <div className="flex min-w-0 items-center">
                      {renderStationLabel(stationId, 'right')}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="hidden md:block">
              <div
                key={selectedBranchId}
                className="grid grid-cols-[minmax(12rem,1fr)_2.5rem_minmax(3rem,6rem)_2.5rem_minmax(12rem,1fr)] items-stretch"
              >
                {Array.from({ length: rowCount }).map((_, index) => {
                  const leftStationId = loopColumns.leftStationIds[index];
                  const rightStationId = loopColumns.rightStationIds[index];
                  const hasLeftStation = leftStationId != null;
                  const hasRightStation = rightStationId != null;

                  return (
                    <Fragment
                      key={`${leftStationId ?? 'empty'}-${rightStationId ?? 'empty'}`}
                    >
                      <div className="flex min-w-0 items-center justify-end pr-2">
                        {hasLeftStation &&
                          renderStationLabel(leftStationId, 'left')}
                      </div>
                      <div>
                        {(hasLeftStation || index > 0) &&
                          renderLoopRailMarker(index, hasLeftStation)}
                      </div>
                      <div />
                      <div>
                        {(hasRightStation || index > 0) &&
                          renderLoopRailMarker(index, hasRightStation)}
                      </div>
                      <div className="flex min-w-0 items-center pl-2">
                        {hasRightStation &&
                          renderStationLabel(rightStationId, 'right')}
                      </div>
                    </Fragment>
                  );
                })}
                {(loopColumns.rightStationIds.length > 0 ||
                  loopColumns.bottomStationId != null) && (
                  <div
                    className={classNames('relative col-start-2 col-end-5', {
                      'h-8': loopColumns.bottomStationId == null,
                      'h-10': loopColumns.bottomStationId != null,
                    })}
                  >
                    <svg
                      aria-hidden="true"
                      className="absolute inset-y-0 right-[1.25rem] left-[1.25rem] overflow-visible"
                      preserveAspectRatio="none"
                      viewBox="0 0 100 40"
                    >
                      <path
                        d="M 0 0 V 12 C 0 26 12 32 28 32 H 72 C 88 32 100 26 100 12 V 0"
                        fill="none"
                        stroke={line.color}
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                        strokeWidth="4"
                        vectorEffect="non-scaling-stroke"
                      />
                      {loopColumns.bottomStationId != null && (
                        <circle
                          className="fill-white dark:fill-gray-900"
                          cx="50"
                          cy="32"
                          r="6"
                          stroke={line.color}
                          strokeWidth="4"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                  </div>
                )}
                {loopColumns.bottomStationId != null && (
                  <div className="col-start-1 col-end-6 flex justify-center pt-6">
                    {renderBottomStationLabel(loopColumns.bottomStationId)}
                  </div>
                )}
              </div>
            </div>
            {!isExpanded && (
              <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-16 bg-gradient-to-t from-white via-white/80 to-transparent md:hidden dark:from-gray-900/95 dark:via-gray-900/60 dark:to-transparent" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-blue-600 text-sm hover:bg-blue-50 md:hidden dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            {isExpanded ? (
              <>
                <FormattedMessage
                  id="general.show_less"
                  defaultMessage="Show less"
                />
                <ChevronUpIcon className="h-4 w-4" />
              </>
            ) : (
              <>
                <FormattedMessage
                  id="general.show_more"
                  defaultMessage="Show More"
                />
                <ChevronDownIcon className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
