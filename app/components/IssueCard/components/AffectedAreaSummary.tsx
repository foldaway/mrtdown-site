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
  type AffectedLineArea,
  getAffectedLineAreas,
  type ResolvedAffectedBranch,
} from '../affectedAreas';
import { AffectedStationList } from './AffectedStationList';

interface Props {
  issue: Issue;
  interval: IssueInterval;
}

function stationRange(
  branch: ResolvedAffectedBranch,
  stations: Record<string, Station>,
  locale: string,
) {
  const first = stations[branch.stationIds[0]];
  if (first == null) return null;
  const last = stations[branch.stationIds.at(-1) ?? ''];
  const firstName = getLocalizedTranslation(first.name, locale);
  if (last == null || last.id === first.id) return firstName;
  return `${firstName} → ${getLocalizedTranslation(last.name, locale)}`;
}

function branchSummary(
  branch: ResolvedAffectedBranch,
  stations: Record<string, Station>,
  locale: string,
  format: ReturnType<typeof useIntl>['formatMessage'],
) {
  const serviceName =
    branch.branch.serviceName != null
      ? getLocalizedTranslation(branch.branch.serviceName, locale)
      : null;
  if (branch.coverage === 'unknown') {
    return (
      serviceName ??
      format({
        id: 'general.affected_services',
        defaultMessage: 'Affected services',
      })
    );
  }
  if (branch.coverage === 'whole-service') {
    const range = stationRange(branch, stations, locale);
    if (branch.isLoop === false && range != null) return range;
    if (branch.isLoop === true && serviceName != null) return serviceName;
    const entireService = format({
      id: 'issue.entire_service',
      defaultMessage: 'Entire service',
    });
    return serviceName == null
      ? entireService
      : `${serviceName} · ${entireService}`;
  }
  if (branch.isLoop === true) {
    const range = stationRange(branch, stations, locale);
    if (serviceName != null && range != null) {
      return `${serviceName}: ${range}`;
    }
    return (
      range ??
      serviceName ??
      format({
        id: 'general.affected_services',
        defaultMessage: 'Affected services',
      })
    );
  }
  const range = stationRange(branch, stations, locale);
  return (
    range ??
    serviceName ??
    format({
      id: 'general.affected_stations',
      defaultMessage: 'Affected stations',
    })
  );
}

function areaSummary(
  area: AffectedArea,
  stations: Record<string, Station>,
  locale: string,
  format: ReturnType<typeof useIntl>['formatMessage'],
) {
  if (area.kind === 'station-points' && area.stationIds.length > 1) {
    const first = stations[area.stationIds[0]];
    const last = stations[area.stationIds.at(-1) ?? ''];
    if (first != null && last != null) {
      return `${getLocalizedTranslation(first.name, locale)} – ${getLocalizedTranslation(last.name, locale)}`;
    }
  }
  if (area.branches.length === 1) {
    return branchSummary(area.branches[0], stations, locale, format);
  }

  if (
    area.branches.every(
      (branch) => branch.coverage !== 'unknown' && branch.isLoop === false,
    )
  ) {
    const first = area.branches[0];
    const source = stations[first.stationIds[0]];
    const destination = stations[first.stationIds.at(-1) ?? ''];
    const reverse = [...first.stationIds].reverse();
    const hasReverse = area.branches.some(
      (branch) =>
        branch !== first &&
        branch.stationIds.length === reverse.length &&
        reverse.every((id, index) => id === branch.stationIds[index]),
    );
    if (source != null && destination != null && source.id !== destination.id) {
      return `${getLocalizedTranslation(source.name, locale)} ${hasReverse ? '↔' : '→'} ${getLocalizedTranslation(destination.name, locale)}`;
    }
  }

  return [
    ...new Set(
      area.branches.map((branch) =>
        branchSummary(branch, stations, locale, format),
      ),
    ),
  ].join(' / ');
}

function isServiceArea(area: AffectedArea) {
  return (
    area.kind === 'service-path' &&
    area.branches.every(
      (branch) =>
        branch.coverage === 'whole-service' ||
        (branch.coverage === 'unknown' && branch.branch.serviceName != null),
    )
  );
}

function summaryContent(
  line: AffectedLineArea,
  stations: Record<string, Station>,
  locale: string,
  intl: ReturnType<typeof useIntl>,
) {
  if (line.wholeLine) {
    return (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
        {intl.formatMessage({
          id: 'issue.entire_line',
          defaultMessage: 'Entire line',
        })}
      </span>
    );
  }
  return line.areas.map((area, index) => {
    const key = area.branches
      .map((branch) => `${branch.branch.branchId}:${branch.stretchIndex}`)
      .join('|');
    const serviceArea = isServiceArea(area);
    return serviceArea ? (
      <span
        key={key}
        className="inline-flex min-w-0 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200"
      >
        <span className="sr-only">
          {intl.formatMessage({
            id: 'general.affected_services',
            defaultMessage: 'Affected services',
          })}
          :{' '}
        </span>
        {areaSummary(area, stations, locale, intl.formatMessage)}
      </span>
    ) : (
      <span key={key} className="min-w-0">
        {index > 0 && !isServiceArea(line.areas[index - 1]) && '· '}
        {areaSummary(area, stations, locale, intl.formatMessage)}
      </span>
    );
  });
}

export const AffectedAreaSummary: React.FC<Props> = ({ issue, interval }) => {
  const intl = useIntl();
  const { lines, stations } = useIncludedEntities();
  const scopeAt = interval.affectedScopeAt ?? interval.startAt;
  const affectedLines = getAffectedLineAreas(
    interval.branchesAffected ?? issue.branchesAffected,
    lines,
    stations,
    scopeAt,
  );

  if (affectedLines.length === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="mt-1 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-1 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-gray-700/50"
      >
        <span className="sr-only">
          {intl.formatMessage({
            id: 'issue.affected_area',
            defaultMessage: 'Affected area',
          })}
        </span>
        {affectedLines.map((area) => {
          const line = lines[area.lineId];
          return (
            <span
              key={area.lineId}
              className="inline-flex min-w-0 items-center gap-1.5 text-gray-700 text-xs dark:text-gray-300"
            >
              <span
                className="shrink-0 rounded px-1 py-0.5 font-bold text-[10px] text-white leading-none"
                style={{ backgroundColor: line?.color ?? '#6b7280' }}
              >
                {area.lineId}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {summaryContent(area, stations, intl.locale, intl)}
              </span>
            </span>
          );
        })}
        <span className="inline-flex shrink-0 items-center text-blue-600 dark:text-blue-300">
          <InformationCircleIcon aria-hidden="true" className="size-3.5" />
          <span className="sr-only">
            {intl.formatMessage({
              id: 'general.view_details',
              defaultMessage: 'View Details',
            })}
          </span>
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={8}>
          <Popover.Popup className="z-50 flex max-h-[min(75vh,var(--available-height))] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-xl outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            <div className="flex shrink-0 items-center justify-between border-gray-200 border-b px-3 py-2.5 dark:border-gray-700">
              <span className="font-semibold text-sm">
                {intl.formatMessage({
                  id: 'issue.affected_services_and_stations',
                  defaultMessage: 'Affected services and stations',
                })}
              </span>
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
            <div className="min-h-0 overflow-y-auto p-3">
              {affectedLines.map((area) => {
                const line = lines[area.lineId];
                if (line == null) return null;
                const entries = area.areas.flatMap((group) => {
                  if (
                    group.kind === 'station-points' &&
                    group.stationIds.length > 1
                  ) {
                    return [
                      {
                        branch: {
                          ...group.branches[0],
                          stationIds: group.stationIds,
                        },
                        label: areaSummary(
                          group,
                          stations,
                          intl.locale,
                          intl.formatMessage,
                        ),
                        groupedPoints: true,
                        stationPoint: true,
                      },
                    ];
                  }
                  return group.branches.map((branch) => ({
                    branch,
                    label:
                      branch.branch.serviceName != null
                        ? getLocalizedTranslation(
                            branch.branch.serviceName,
                            intl.locale,
                          )
                        : null,
                    groupedPoints: false,
                    stationPoint: group.kind === 'station-points',
                  }));
                });
                return (
                  <section key={area.lineId} className="mb-4 last:mb-0">
                    <h4 className="mb-2 flex items-center gap-2 font-semibold text-xs">
                      <Link
                        to="/{-$lang}/lines/$lineId"
                        params={{ lineId: line.id }}
                        className="inline-flex items-center gap-2 hover:underline"
                      >
                        <span
                          className="rounded px-1.5 py-0.5 font-bold text-white"
                          style={{ backgroundColor: line.color }}
                        >
                          {line.id}
                        </span>
                        {getLocalizedTranslation(line.name, intl.locale)}
                      </Link>
                    </h4>
                    <div className="space-y-1.5">
                      {entries.map((entry) => {
                        const { branch, label, groupedPoints, stationPoint } =
                          entry;
                        const range =
                          groupedPoints ||
                          (branch.isLoop === true &&
                            branch.coverage === 'whole-service' &&
                            branch.stationIds.length > 1)
                            ? null
                            : stationRange(branch, stations, intl.locale);
                        return (
                          <details
                            key={`${branch.branch.branchId}:${branch.stretchIndex}`}
                            className="group rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30"
                          >
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:hidden">
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-xs">
                                  {label ??
                                    intl.formatMessage({
                                      id: 'issue.affected_stations',
                                      defaultMessage: 'Affected stations',
                                    })}
                                </span>
                                <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                                  {branch.coverage === 'unknown'
                                    ? intl.formatMessage({
                                        id: 'issue.coverage_unavailable',
                                        defaultMessage:
                                          'Coverage unavailable for this date',
                                      })
                                    : branch.coverage === 'whole-service'
                                      ? intl.formatMessage({
                                          id: 'issue.entire_service',
                                          defaultMessage: 'Entire service',
                                        })
                                      : range}
                                  {branch.stationIds.length > 0 &&
                                    `${branch.coverage === 'unknown' || branch.coverage === 'whole-service' || range != null ? ' · ' : ''}${intl.formatMessage(
                                      {
                                        id: 'issue.station_count',
                                        defaultMessage:
                                          '{count, plural, one {# station} other {# stations}}',
                                      },
                                      { count: branch.stationIds.length },
                                    )}`}
                                </span>
                              </span>
                              <ChevronDownIcon className="size-4 shrink-0 text-gray-400 group-open:rotate-180" />
                            </summary>
                            <AffectedStationList
                              branch={branch}
                              line={line}
                              stations={stations}
                              referenceAt={scopeAt}
                              schematic={
                                !stationPoint && branch.coverage !== 'unknown'
                              }
                            />
                          </details>
                        );
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
