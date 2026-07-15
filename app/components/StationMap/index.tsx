import { Link, useNavigate } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { Tabs } from 'radix-ui';
import type React from 'react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { FormattedList, FormattedMessage, useIntl } from 'react-intl';
import { ZoomControls } from '~/components/ZoomControls';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { IssueAffectedBranch, Station } from '~/types';
import { assert } from '~/util/assert';
import { MapApr2025 } from './components/MapApr2025';
import { Timeline } from './components/Timeline';
import { segmentText } from './helpers/segmentText';

type MapSnapshotId =
  | '2012-01'
  | '2017-11'
  | '2019-12'
  | '2024-11'
  | '2025-04'
  | '2026-07'
  | '2027-12'
  | '2029-12'
  | '2030-12'
  | '2032-12';

export type StationMapSnapshotComponent = React.ElementType<{
  ref?: React.Ref<SVGSVGElement>;
}>;

export type StationMapSnapshotComponents = Partial<
  Record<MapSnapshotId, StationMapSnapshotComponent>
>;

const MapDec2032 = lazy(() =>
  import('./components/MapDec2032').then((module) => ({
    default: module.MapDec2032,
  })),
);
const MapDec2030 = lazy(() =>
  import('./components/MapDec2030').then((module) => ({
    default: module.MapDec2030,
  })),
);
const MapDec2029 = lazy(() =>
  import('./components/MapDec2029').then((module) => ({
    default: module.MapDec2029,
  })),
);
const MapDec2027 = lazy(() =>
  import('./components/MapDec2027').then((module) => ({
    default: module.MapDec2027,
  })),
);
const MapNov2024 = lazy(() =>
  import('./components/MapNov2024').then((module) => ({
    default: module.MapNov2024,
  })),
);
const MapDec2019 = lazy(() =>
  import('./components/MapDec2019').then((module) => ({
    default: module.MapDec2019,
  })),
);
const MapNov2017 = lazy(() =>
  import('./components/MapNov2017').then((module) => ({
    default: module.MapNov2017,
  })),
);
const MapJan2012 = lazy(() =>
  import('./components/MapJan2012').then((module) => ({
    default: module.MapJan2012,
  })),
);

type FocusedLineBranch = {
  id: string;
  stationIds: string[];
};

export type StationMapMode =
  | {
      type: 'network';
      branchesAffected: IssueAffectedBranch[];
      showAffectedStationsSummary?: boolean;
      showTimeline?: boolean;
    }
  | {
      type: 'focused-line';
      branches: FocusedLineBranch[];
      lineId: string;
      showTimeline?: boolean;
    }
  | {
      type: 'focused-stations';
      stationIds: string[];
      showTimeline?: boolean;
    };

interface Props {
  currentDate?: string;
  mode: StationMapMode;
  snapshotComponents?: StationMapSnapshotComponents;
  stationNames?: Record<string, Station['name']>;
}

export const StationMap: React.FC<Props> = (props) => {
  const { currentDate, mode, snapshotComponents, stationNames } = props;

  const intl = useIntl();
  const navigate = useNavigate();

  const included = useIncludedEntities();

  const [ref, setRef] = useState<SVGElement | null>(null);

  const affectedStationIds = useMemo(() => {
    const result = new Set<string>();
    if (mode.type !== 'network') {
      return result;
    }

    for (const entry of mode.branchesAffected) {
      for (const stationId of entry.stationIds) {
        result.add(stationId);
      }
    }
    return result;
  }, [mode]);

  const focusedStationIds = useMemo(() => {
    const result = new Set<string>();
    if (mode.type === 'focused-line') {
      for (const entry of mode.branches) {
        for (const stationId of entry.stationIds) {
          result.add(stationId);
        }
      }
    } else if (mode.type === 'focused-stations') {
      for (const stationId of mode.stationIds) {
        result.add(stationId);
      }
    }
    return result;
  }, [mode]);

  useEffect(() => {
    if (ref == null) {
      return;
    }

    const branchesAffected =
      mode.type === 'network' ? mode.branchesAffected : [];
    const linesByStationId: Record<string, Set<string>> = {};
    const linesPatchedByStationId: Record<string, Set<string>> = {};
    const componentByLineId: Record<string, string> = {};

    const isSingleStationCase =
      branchesAffected.length === 1 &&
      branchesAffected[0].stationIds.length === 1;

    for (const entry of branchesAffected) {
      for (const stationId of entry.stationIds) {
        // Retrieve all lines connected to this station
        const lineElements = [
          ...ref.querySelectorAll(`[id^='line_${stationId.toLowerCase()}:']`),
          ...ref.querySelectorAll(`[id$=':${stationId.toLowerCase()}']`),
        ] as SVGGElement[];

        for (const lineElement of lineElements) {
          const linesStation = linesByStationId[stationId] ?? new Set();
          linesStation.add(lineElement.id);
          linesByStationId[stationId] = linesStation;

          const parentElement = lineElement.parentElement;
          if (parentElement != null) {
            const lineComponentId = parentElement.id.replace(/^line_/, '');
            componentByLineId[lineElement.id] = lineComponentId;
          }
        }

        if (!isSingleStationCase) {
          for (const otherStationId of entry.stationIds) {
            if (stationId === otherStationId) {
              continue;
            }

            for (const lineElement of lineElements) {
              switch (lineElement.id) {
                case `line_${stationId.toLowerCase()}:${otherStationId.toLowerCase()}`:
                case `line_${otherStationId.toLowerCase()}:${stationId.toLowerCase()}`: {
                  const componentId = componentByLineId[lineElement.id];
                  if (
                    componentId != null &&
                    componentId.toLowerCase() !== entry.lineId.toLowerCase()
                  ) {
                    continue;
                  }

                  lineElement.style.opacity = '0.3';

                  const linesPatchedStation =
                    linesPatchedByStationId[stationId] ?? new Set();
                  linesPatchedStation.add(lineElement.id);
                  linesPatchedByStationId[stationId] = linesPatchedStation;
                  const linePatchedOtherStation =
                    linesPatchedByStationId[otherStationId] ?? new Set();
                  linePatchedOtherStation.add(lineElement.id);
                  linesPatchedByStationId[otherStationId] =
                    linePatchedOtherStation;

                  break;
                }
              }
            }
          }
        } else {
          for (const lineElement of lineElements) {
            const componentId = componentByLineId[lineElement.id];
            if (
              componentId != null &&
              componentId.toLowerCase() !== entry.lineId.toLowerCase()
            ) {
              continue;
            }

            lineElement.style.opacity = '0.3';

            const linesPatchedStation =
              linesPatchedByStationId[stationId] ?? new Set();
            linesPatchedStation.add(lineElement.id);
            linesPatchedByStationId[stationId] = linesPatchedStation;
          }
        }
      }
    }

    for (const entry of branchesAffected) {
      for (const stationId of entry.stationIds) {
        const lines = linesByStationId[stationId] ?? new Set();
        const patchedLines = linesPatchedByStationId[stationId] ?? new Set();

        const nodeElement: SVGGElement | null = ref.querySelector(
          `#node_${stationId.toLowerCase()}`,
        );

        const lineCountForComponent = Array.from(lines).filter((lineId) => {
          const lineComponentId = componentByLineId[lineId];
          return lineComponentId.toLowerCase() === entry.lineId.toLowerCase();
        }).length;

        const patchedLineCountForComponent = Array.from(patchedLines).filter(
          (lineId) => {
            const lineComponentId = componentByLineId[lineId];
            return lineComponentId.toLowerCase() === entry.lineId.toLowerCase();
          },
        ).length;

        if (
          nodeElement != null &&
          patchedLineCountForComponent === lineCountForComponent
        ) {
          // All SVG lines connected to this station for the entry's component have been patched out
          const componentElement: SVGGElement | null =
            nodeElement.querySelector(`[id^='${entry.lineId.toLowerCase()}']`);
          if (componentElement != null) {
            // Patch out the section of the station node for the entry's component
            componentElement.style.opacity = '0.3';
          }
        }

        if (patchedLines.size === lines.size) {
          // All SVG lines connected to this station have been patched out
          const labelElement: SVGGElement | null = ref.querySelector(
            `#label_${stationId.toLowerCase()}`,
          );
          if (labelElement != null) {
            // Patch out the station label
            labelElement.style.opacity = '0.3';
          }
        }
      }
    }

    const labelsElement: SVGGElement | null = ref.querySelector('#labels');
    if (labelsElement != null) {
      const labelElements = [
        ...labelsElement.querySelectorAll<SVGGraphicsElement>("[id^='label_']"),
      ];
      for (const labelElement of labelElements) {
        const stationId = labelElement.id.replace(/^label_/, '').toUpperCase();
        const tspans = [...labelElement.querySelectorAll('tspan')];

        // Snapshot labels have a hard-coded dark fill. Apply the theme color to
        // the text nodes because multi-line labels can be wrapped in a <g>, with
        // each child <text> carrying its own fill.
        const labelTextElements = labelElement.matches('text, tspan')
          ? [labelElement]
          : [
              ...labelElement.querySelectorAll<SVGGraphicsElement>(
                'text, tspan',
              ),
            ];
        for (const labelTextElement of labelTextElements) {
          labelTextElement.removeAttribute('fill');
          labelTextElement.classList.add('fill-gray-800', 'dark:fill-gray-300');
        }

        const stationNameTranslations =
          stationNames?.[stationId] ?? included.stations[stationId]?.name;
        if (stationNameTranslations == null) {
          continue;
        }
        const stationName = getLocalizedTranslation(
          stationNameTranslations,
          intl.locale,
        );
        const segments = segmentText(stationName, intl.locale);
        for (let i = 0; i < tspans.length; i++) {
          const tspan = tspans[i];

          switch (i) {
            case tspans.length - 1: {
              tspan.textContent = segments.join('');
              break;
            }
            default: {
              const origTextLength = tspan.getComputedTextLength();
              tspan.textContent = '';
              while (segments.length > 0) {
                const textContentBeforeChange: string = tspan.textContent;
                const firstSegment = segments.shift();
                assert(firstSegment != null);
                tspan.textContent = `${textContentBeforeChange}${firstSegment}`;
                if (tspan.getComputedTextLength() > origTextLength) {
                  tspan.textContent = textContentBeforeChange;
                  segments.unshift(firstSegment);
                  break;
                }
              }
              break;
            }
          }
        }
        labelElement.classList.add('hover:underline');

        // Automatically move into parent <a> tag
        const parentElement = labelElement.parentElement;
        if (parentElement != null && parentElement.tagName !== 'A') {
          const newParentElement = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'a',
          );
          const href = buildLocaleAwareLink(
            `/stations/${stationId}`,
            intl.locale,
          );
          newParentElement.setAttributeNS(null, 'href', href);
          newParentElement.onclick = (e) => {
            e.preventDefault();
            navigate({
              to: '/{-$lang}/stations/$stationId',
              params: { stationId },
            });
          };
          parentElement.removeChild(labelElement);
          newParentElement.appendChild(labelElement);
          parentElement.appendChild(newParentElement);
        }

        // Add title label for native tooltip
        let titleElement = labelElement.querySelector(
          'title',
        ) as SVGTitleElement | null;
        if (titleElement == null) {
          titleElement = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'title',
          );
          labelElement.appendChild(titleElement);
        }
        titleElement.textContent = stationName;
      }
    }

    if (mode.type === 'focused-line') {
      const normalizedLineId = mode.lineId.toLowerCase();
      const focusedSegmentIds = new Set<string>();
      const focusedComponentIds = new Set<string>();

      for (const branch of mode.branches) {
        for (let index = 0; index < branch.stationIds.length - 1; index++) {
          const stationId = branch.stationIds[index].toLowerCase();
          const nextStationId = branch.stationIds[index + 1].toLowerCase();
          focusedSegmentIds.add(`line_${stationId}:${nextStationId}`);
          focusedSegmentIds.add(`line_${nextStationId}:${stationId}`);
        }
      }

      const lineSegmentElements = [
        ...ref.querySelectorAll<SVGElement>("[id^='line_']"),
      ].filter((element) => element.id.includes(':'));

      for (const lineSegmentElement of lineSegmentElements) {
        const isFocusedSegment = focusedSegmentIds.has(lineSegmentElement.id);
        lineSegmentElement.style.opacity = isFocusedSegment ? '1' : '0.18';

        if (isFocusedSegment) {
          const parentElement = lineSegmentElement.parentElement;
          if (parentElement?.id.startsWith('line_')) {
            focusedComponentIds.add(parentElement.id.replace(/^line_/, ''));
          }
        }
      }

      const focusedComponentIdPrefixes = [
        normalizedLineId,
        ...focusedComponentIds,
      ];
      const isFocusedComponentId = (componentId: string) =>
        focusedComponentIdPrefixes.some(
          (focusedComponentId) =>
            componentId === focusedComponentId ||
            componentId.startsWith(`${focusedComponentId}_`),
        );

      const nodeElements = [
        ...ref.querySelectorAll<SVGGElement>("g[id^='node_']"),
      ];
      for (const nodeElement of nodeElements) {
        const stationId = nodeElement.id.replace(/^node_/, '').toUpperCase();
        const isFocusedStation = focusedStationIds.has(stationId);
        nodeElement.style.opacity = isFocusedStation ? '1' : '0.2';

        if (!isFocusedStation) {
          continue;
        }

        for (const componentElement of nodeElement.querySelectorAll<SVGGElement>(
          ':scope g[id]',
        )) {
          const isFocusedComponent = isFocusedComponentId(componentElement.id);
          componentElement.style.opacity = isFocusedComponent ? '1' : '0.25';
        }
      }

      const labelsElement: SVGGElement | null = ref.querySelector('#labels');
      if (labelsElement != null) {
        for (const labelElement of labelsElement.querySelectorAll<SVGGraphicsElement>(
          "[id^='label_']",
        )) {
          const stationId = labelElement.id
            .replace(/^label_/, '')
            .toUpperCase();
          labelElement.style.opacity = focusedStationIds.has(stationId)
            ? '1'
            : '0.18';
        }
      }
    }

    if (mode.type === 'focused-stations') {
      const lineSegmentElements = [
        ...ref.querySelectorAll<SVGElement>("[id^='line_']"),
      ].filter((element) => element.id.includes(':'));

      for (const lineSegmentElement of lineSegmentElements) {
        const [fromStationId, toStationId] = lineSegmentElement.id
          .replace(/^line_/, '')
          .toUpperCase()
          .split(':');
        const isFocusedSegment =
          focusedStationIds.has(fromStationId) &&
          focusedStationIds.has(toStationId);
        lineSegmentElement.style.opacity = isFocusedSegment ? '1' : '0.15';
      }

      for (const nodeElement of ref.querySelectorAll<SVGGElement>(
        "g[id^='node_']",
      )) {
        const stationId = nodeElement.id.replace(/^node_/, '').toUpperCase();
        nodeElement.style.opacity = focusedStationIds.has(stationId)
          ? '1'
          : '0.16';
      }

      const labelsElement: SVGGElement | null = ref.querySelector('#labels');
      if (labelsElement != null) {
        for (const labelElement of labelsElement.querySelectorAll<SVGGraphicsElement>(
          "[id^='label_']",
        )) {
          const stationId = labelElement.id
            .replace(/^label_/, '')
            .toUpperCase();
          labelElement.style.opacity = focusedStationIds.has(stationId)
            ? '1'
            : '0.12';
        }
      }
    }
  }, [
    ref,
    focusedStationIds,
    included.stations,
    intl.locale,
    mode,
    navigate,
    stationNames,
  ]);

  const defaultTab = useMemo(() => {
    if (currentDate == null) {
      return '2025-04';
    }
    const dateTime = DateTime.fromISO(currentDate);
    assert(dateTime.isValid);
    if (dateTime >= DateTime.fromObject({ year: 2032, month: 12 })) {
      return '2032-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2030, month: 12 })) {
      return '2030-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2029, month: 12 })) {
      return '2029-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2027, month: 12 })) {
      return '2027-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2026, month: 7 })) {
      return '2026-07';
    }
    if (dateTime >= DateTime.fromObject({ year: 2025, month: 4 })) {
      return '2025-04';
    }
    if (dateTime >= DateTime.fromObject({ year: 2024, month: 11 })) {
      return '2024-11';
    }
    if (dateTime >= DateTime.fromObject({ year: 2019, month: 12 })) {
      return '2019-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2017, month: 11 })) {
      return '2017-11';
    }
    return '2012-01';
  }, [currentDate]);

  const showTimeline = mode.showTimeline ?? mode.type === 'network';
  const showAffectedStationsSummary =
    mode.type === 'network' && mode.showAffectedStationsSummary !== false;

  const renderSnapshot = (
    snapshotId: MapSnapshotId,
    DefaultComponent: StationMapSnapshotComponent,
  ) => {
    const SnapshotComponent = snapshotComponents?.[snapshotId];

    if (SnapshotComponent != null) {
      return <SnapshotComponent ref={setRef} />;
    }

    if (snapshotId === '2026-07') {
      return <DefaultComponent ref={setRef} />;
    }

    return (
      <Suspense fallback={<StationMapSnapshotFallback />}>
        <DefaultComponent ref={setRef} />
      </Suspense>
    );
  };

  return (
    <div className="flex flex-col fill-gray-800 dark:fill-gray-50">
      {/* Tailwind Class trappers */}
      <div className="hidden fill-gray-800 stroke-gray-800 dark:fill-gray-300 dark:stroke-gray-300" />

      <Tabs.Root defaultValue={defaultTab}>
        {showTimeline && <Timeline currentDate={currentDate} />}
        <div className="relative overflow-hidden">
          <div className="overflow-auto">
            <Tabs.Content value="2032-12">
              {renderSnapshot('2032-12', MapDec2032)}
            </Tabs.Content>
            <Tabs.Content value="2030-12">
              {renderSnapshot('2030-12', MapDec2030)}
            </Tabs.Content>
            <Tabs.Content value="2029-12">
              {renderSnapshot('2029-12', MapDec2029)}
            </Tabs.Content>
            <Tabs.Content value="2027-12">
              {renderSnapshot('2027-12', MapDec2027)}
            </Tabs.Content>
            <Tabs.Content value="2026-07">
              {renderSnapshot('2026-07', MapApr2025)}
            </Tabs.Content>
            <Tabs.Content value="2025-04">
              {renderSnapshot('2025-04', MapApr2025)}
            </Tabs.Content>
            <Tabs.Content value="2024-11">
              {renderSnapshot('2024-11', MapNov2024)}
            </Tabs.Content>
            <Tabs.Content value="2019-12">
              {renderSnapshot('2019-12', MapDec2019)}
            </Tabs.Content>
            <Tabs.Content value="2017-11">
              {renderSnapshot('2017-11', MapNov2017)}
            </Tabs.Content>
            <Tabs.Content value="2012-01">
              {renderSnapshot('2012-01', MapJan2012)}
            </Tabs.Content>
          </div>
          <ZoomControls svgRef={ref} initialZoom={1} />
        </div>
      </Tabs.Root>

      {showAffectedStationsSummary && affectedStationIds.size > 0 && (
        <>
          <span className="font-bold text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{
                count: affectedStationIds.size,
              }}
            />
          </span>
          <span className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedList
              value={Array.from(affectedStationIds).map((stationId) => {
                const station = included.stations[stationId];

                return (
                  <Link
                    className="hover:underline"
                    key={stationId}
                    to="/{-$lang}/stations/$stationId"
                    params={{ stationId }}
                  >
                    {getLocalizedTranslation(station.name, intl.locale)}
                  </Link>
                );
              })}
            />
          </span>
        </>
      )}
    </div>
  );
};

function StationMapSnapshotFallback() {
  return (
    <div className="flex min-h-[28rem] items-center justify-center bg-gray-100 dark:bg-gray-800">
      <div className="h-64 w-full max-w-5xl animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
