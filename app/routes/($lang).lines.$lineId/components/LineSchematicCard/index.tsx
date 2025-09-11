import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { DropdownMenu } from 'radix-ui';
import { Fragment, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Line, LineBranch } from '~/client';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
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

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-8 md:row-span-2 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.line_schematic"
          defaultMessage="Line Schematic"
        />
      </span>
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
                'max-h-96': !isExpanded,
                'max-h-none': isExpanded,
              },
            )}
          >
            <div
              key={selectedBranchId}
              className="grid grid-flow-row grid-cols-[auto_1fr] gap-x-4"
            >
              {selectedBranch.stationIds.map((stationId, index) => (
                <Fragment key={stationId}>
                  <div className="relative flex h-12 items-center justify-center">
                    <div
                      className="z-20 size-4 rounded-full border-4 bg-white"
                      style={{
                        borderColor: line.color,
                      }}
                    />
                    <div
                      className={classNames(
                        '-translate-x-1/2 absolute left-1/2 z-10 w-1',
                        {
                          'top-1/2 bottom-0': index === 0,
                          'top-0 bottom-1/2':
                            index === selectedBranch.stationIds.length - 1,
                          'top-0 bottom-0':
                            index > 0 &&
                            index < selectedBranch.stationIds.length - 1,
                        },
                      )}
                      style={{
                        backgroundColor: line.color,
                      }}
                    />
                  </div>
                  <div className="relative flex items-center gap-x-2">
                    <div className="flex items-center overflow-hidden rounded-md">
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
                    <div className="flex">
                      <Link
                        to={buildLocaleAwareLink(
                          `/stations/${stationId}`,
                          intl.locale,
                        )}
                        className="group flex"
                      >
                        <span className="text-gray-800 text-sm group-hover:underline dark:text-gray-200">
                          {stations[stationId].nameTranslations[intl.locale] ??
                            stations[stationId].name}
                        </span>
                      </Link>
                    </div>
                  </div>
                </Fragment>
              ))}
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
    </div>
  );
};
