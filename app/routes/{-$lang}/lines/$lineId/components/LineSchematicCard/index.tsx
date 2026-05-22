import {
  ChevronDownIcon,
  ChevronUpIcon,
  ListBulletIcon,
  MapIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { DropdownMenu, Tabs } from 'radix-ui';
import { Fragment, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { StationMap } from '~/components/StationMap';
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
      return { leftStationIds: [], rightStationIds: [] };
    }

    const midpoint = Math.ceil(selectedBranch.stationIds.length / 2);
    return {
      leftStationIds: selectedBranch.stationIds.slice(0, midpoint),
      rightStationIds: selectedBranch.stationIds.slice(midpoint).reverse(),
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
        className={classNames('flex items-center gap-x-2', {
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

  const renderRailMarker = (index: number) => (
    <div className="relative flex h-14 items-center justify-center">
      <div
        className={classNames('-translate-x-1/2 absolute left-1/2 z-10 w-1', {
          'top-1/2 bottom-0': index === 0,
          'top-0 bottom-0': index > 0,
        })}
        style={{
          backgroundColor: line.color,
        }}
      />
      <div
        className="z-20 size-4 rounded-full border-4 bg-white dark:bg-gray-900"
        style={{
          borderColor: line.color,
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-8 md:row-span-2 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.line_schematic"
          defaultMessage="Line Schematic"
        />
      </span>
      <Tabs.Root
        defaultValue="schematic"
        className="mt-2 flex min-h-0 flex-col"
      >
        <Tabs.List className="mb-4 inline-flex self-start rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <Tabs.Trigger
            value="schematic"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 font-medium text-gray-600 text-sm transition-colors data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"
          >
            <ListBulletIcon className="h-4 w-4" />
            <FormattedMessage
              id="general.line_schematic"
              defaultMessage="Line Schematic"
            />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="system-map"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 font-medium text-gray-600 text-sm transition-colors data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"
          >
            <MapIcon className="h-4 w-4" />
            <FormattedMessage
              id="general.system_map"
              defaultMessage="System Map"
            />
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="schematic" className="min-h-0">
          <div className="min-w-64 md:self-start">
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
                  'relative mt-4 overflow-hidden transition-all duration-300',
                  {
                    'max-h-[60rem]': !isExpanded,
                    'max-h-none': isExpanded,
                  },
                )}
              >
                <div className="overflow-x-auto">
                  <div
                    key={selectedBranchId}
                    className="grid min-w-[42rem] grid-cols-[minmax(12rem,1fr)_2.5rem_minmax(3rem,6rem)_2.5rem_minmax(12rem,1fr)] items-stretch"
                  >
                    {Array.from({ length: rowCount }).map((_, index) => {
                      const leftStationId = loopColumns.leftStationIds[index];
                      const rightStationId = loopColumns.rightStationIds[index];

                      return (
                        <Fragment
                          key={`${leftStationId ?? 'empty'}-${rightStationId ?? 'empty'}`}
                        >
                          <div className="flex min-w-0 items-center pr-2">
                            {leftStationId != null &&
                              renderStationLabel(leftStationId, 'left')}
                          </div>
                          <div>
                            {leftStationId != null && renderRailMarker(index)}
                          </div>
                          <div />
                          <div>
                            {rightStationId != null && renderRailMarker(index)}
                          </div>
                          <div className="flex min-w-0 items-center pl-2">
                            {rightStationId != null &&
                              renderStationLabel(rightStationId, 'right')}
                          </div>
                        </Fragment>
                      );
                    })}
                    {loopColumns.rightStationIds.length > 0 && (
                      <div className="col-start-2 col-end-5 h-8 px-[1.25rem]">
                        <div
                          className="h-full rounded-b-[2rem] border-r-4 border-b-4 border-l-4"
                          style={{
                            borderColor: line.color,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {!isExpanded && (
                  <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-16 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-gray-900/95 dark:via-gray-900/60 dark:to-transparent" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-blue-600 text-sm hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
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
        </Tabs.Content>

        <Tabs.Content
          value="system-map"
          className="min-h-0 bg-gray-100 p-3 dark:bg-gray-800"
        >
          <StationMap
            currentDate={DateTime.now().toISODate()}
            mode={{
              type: 'focused-line',
              lineId: line.id,
              branches,
            }}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};
