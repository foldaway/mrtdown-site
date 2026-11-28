import { Popover } from '@base-ui/react/popover';
import {
  ChevronDownIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import { Link } from '@tanstack/react-router';
import { useIntl } from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { Issue, IssueInterval, Station } from '~/types';
import {
  type AffectedArea,
  getAffectedLineAreas,
  type ResolvedAffectedBranch,
} from '../affectedAreas';
import { AffectedStationList } from './AffectedStationList';

interface Props {
  issue: Issue;
  interval: IssueInterval;
}

function stationRange(
  ids: readonly string[],
  stations: Record<string, Station>,
  locale: string,
) {
  const first = stations[ids[0]];
  const last = stations[ids.at(-1) ?? ''];
  if (first == null) return null;
  const name = getLocalizedTranslation(first.name, locale);
  return last == null || last.id === first.id
    ? name
    : `${name} → ${getLocalizedTranslation(last.name, locale)}`;
}

function branchLabel(
  branch: ResolvedAffectedBranch,
  stations: Record<string, Station>,
  locale: string,
) {
  const name = branch.branch.serviceName
    ? getLocalizedTranslation(branch.branch.serviceName, locale)
    : null;
  const range = stationRange(branch.stationIds, stations, locale);
  if (branch.coverage === 'unknown') return name;
  if (branch.isLoop && name != null) {
    return branch.coverage === 'whole-service' || range == null
      ? name
      : `${name}: ${range}`;
  }
  return range ?? name;
}

function areaLabel(
  area: AffectedArea,
  stations: Record<string, Station>,
  locale: string,
) {
  if (area.kind === 'station-points') {
    return stationRange(area.stationIds, stations, locale)?.replace(
      ' → ',
      ' – ',
    );
  }
  const first = area.branches[0];
  if (area.branches.length === 1) return branchLabel(first, stations, locale);
  if (area.branches.every((branch) => !branch.isLoop)) {
    const range = stationRange(first.stationIds, stations, locale);
    if (range?.includes(' → ')) return range.replace(' → ', ' ↔ ');
  }
  return [
    ...new Set(
      area.branches.map((branch) => branchLabel(branch, stations, locale)),
    ),
  ]
    .filter(Boolean)
    .join(' · ');
}

function serviceChip(area: AffectedArea) {
  return (
    area.kind === 'service-path' &&
    area.branches.every(
      (branch) =>
        (branch.coverage === 'whole-service' && branch.isLoop) ||
        (branch.coverage === 'unknown' && branch.branch.serviceName != null),
    )
  );
}

function areaKey(area: AffectedArea) {
  return area.branches
    .map((branch) => `${branch.branch.branchId}:${branch.stretchIndex}`)
    .join('|');
}

export const AffectedAreaSummary: React.FC<Props> = ({ issue, interval }) => {
  const intl = useIntl();
  const { lines, stations } = useIncludedEntities();
  const referenceAt = interval.startAt;
  const areas = getAffectedLineAreas(
    issue.branchesAffected,
    stations,
    referenceAt,
  );
  if (areas.length === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="group mt-1 flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <span className="sr-only">
          {intl.formatMessage({
            id: 'issue.affected_area',
            defaultMessage: 'Affected area',
          })}
        </span>
        {areas.map((lineArea) => (
          <span
            key={lineArea.lineId}
            className="inline-flex min-w-0 items-center gap-1.5 text-gray-700 text-xs dark:text-gray-300"
          >
            <span
              className="shrink-0 rounded px-1 py-0.5 font-bold text-[10px] text-white leading-none"
              style={{
                backgroundColor: lines[lineArea.lineId]?.color ?? '#6b7280',
              }}
            >
              {lineArea.lineId}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {lineArea.areas.map((area, index) => {
                const label = areaLabel(area, stations, intl.locale);
                if (label == null || label === '') return null;
                return serviceChip(area) ? (
                  <span
                    key={areaKey(area)}
                    className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {label}
                  </span>
                ) : (
                  <span key={areaKey(area)}>
                    {index > 0 && '· '}
                    {label}
                  </span>
                );
              })}
            </span>
          </span>
        ))}
        <InformationCircleIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-blue-600 transition-colors group-hover:text-blue-800 group-focus-visible:text-blue-800 dark:text-blue-300 dark:group-focus-visible:text-blue-100 dark:group-hover:text-blue-100"
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          collisionAvoidance={{ fallbackAxisSide: 'none' }}
        >
          <Popover.Popup className="z-50 flex max-h-[min(75vh,var(--available-height))] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-xl outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            <div className="flex shrink-0 items-center justify-between border-gray-200 border-b px-3 py-2.5 dark:border-gray-700">
              <strong className="text-sm">
                {intl.formatMessage({
                  id: 'issue.affected_services_and_stations',
                  defaultMessage: 'Affected services and stations',
                })}
              </strong>
              <Popover.Close
                aria-label={intl.formatMessage({
                  id: 'general.close',
                  defaultMessage: 'Close',
                })}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="size-4" />
              </Popover.Close>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto p-3">
              {areas.map(({ lineId, areas: lineAreas }) => {
                const line = lines[lineId];
                if (line == null) return null;
                return (
                  <section key={lineId}>
                    <Link
                      to="/{-$lang}/lines/$lineId"
                      params={{ lineId }}
                      className="mb-2 inline-flex items-center gap-2 font-semibold text-xs hover:underline"
                    >
                      <span
                        className="rounded px-1.5 py-0.5 font-bold text-white"
                        style={{ backgroundColor: line.color }}
                      >
                        {lineId}
                      </span>
                      {getLocalizedTranslation(line.name, intl.locale)}
                    </Link>
                    <div className="space-y-1.5">
                      {lineAreas.flatMap((area) => {
                        const branches =
                          area.kind === 'station-points'
                            ? [
                                {
                                  ...area.branches[0],
                                  stationIds: area.stationIds,
                                },
                              ]
                            : area.branches;
                        return branches.map((branch) => (
                          <details
                            key={`${branch.branch.branchId}:${branch.stretchIndex}`}
                            className="group rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30"
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium text-xs marker:hidden">
                              <span>
                                {area.kind === 'station-points'
                                  ? areaLabel(area, stations, intl.locale)
                                  : (branchLabel(
                                      branch,
                                      stations,
                                      intl.locale,
                                    ) ??
                                    intl.formatMessage({
                                      id: 'issue.affected_stations',
                                      defaultMessage: 'Affected stations',
                                    }))}
                              </span>
                              <ChevronDownIcon
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-gray-400 group-open:rotate-180"
                              />
                            </summary>
                            <AffectedStationList
                              branch={branch}
                              line={line}
                              stations={stations}
                              referenceAt={referenceAt}
                              schematic={
                                area.kind === 'service-path' &&
                                branch.coverage !== 'unknown'
                              }
                            />
                          </details>
                        ));
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
