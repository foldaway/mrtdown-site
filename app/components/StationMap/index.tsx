import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FormattedDate,
  FormattedList,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import type { IssueStationEntry, StationTranslatedNames } from '~/types';
import { segmentText } from './helpers/segmentText';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useNavigate } from 'react-router';
import { Link } from 'react-router';
import { MapApr2025 } from './components/MapApr2025';
import { DateTime } from 'luxon';
import { assert } from '~/util/assert';
import { MapNov2017 } from './components/MapNov2017';
import { MapDec2027 } from './components/MapDec2027';
import { ClockIcon, StarIcon } from '@heroicons/react/24/outline';
import { MapJan2012 } from './components/MapJan2012';
import { MapDec2030 } from './components/MapDec2030';
import { MapDec2029 } from './components/MapDec2029';
import { MapDec2019 } from './components/MapDec2019';
import { MapNov2024 } from './components/MapNov2024';

interface Props {
  stationIdsAffected: IssueStationEntry[];
  componentIdsAffected: string[];
  currentDate?: string;
}

export const StationMap: React.FC<Props> = (props) => {
  const { stationIdsAffected, currentDate } = props;

  const intl = useIntl();
  const navigate = useNavigate();

  const stationTranslatedNamesQuery = useQuery<StationTranslatedNames>({
    queryKey: ['station-translated-names', intl.locale],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.foldaway.space/product/station_names_${intl.locale}.json`,
      ).then((r) => r.json()),
  });

  const stationTranslatedNames = useMemo(() => {
    return stationTranslatedNamesQuery.data ?? {};
  }, [stationTranslatedNamesQuery.data]);

  const [ref, setRef] = useState<SVGElement | null>(null);

  const stationIds = useMemo(() => {
    const result = new Set<string>();
    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        result.add(stationId);
      }
    }
    return result;
  }, [stationIdsAffected]);

  useEffect(() => {
    if (ref == null) {
      return;
    }

    const linesByStationId: Record<string, Set<string>> = {};
    const linesPatchedByStationId: Record<string, Set<string>> = {};
    const componentByLineId: Record<string, string> = {};

    const isSingleStationCase =
      stationIdsAffected.length === 1 &&
      stationIdsAffected[0].stationIds.length === 1;

    for (const entry of stationIdsAffected) {
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
                    componentId.toLowerCase() !==
                      entry.componentId.toLowerCase()
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
              componentId.toLowerCase() !== entry.componentId.toLowerCase()
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

    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        const lines = linesByStationId[stationId] ?? new Set();
        const patchedLines = linesPatchedByStationId[stationId] ?? new Set();

        const nodeElement: SVGGElement | null = ref.querySelector(
          `#node_${stationId.toLowerCase()}`,
        );

        const lineCountForComponent = Array.from(lines).filter((lineId) => {
          const lineComponentId = componentByLineId[lineId];
          return (
            lineComponentId.toLowerCase() === entry.componentId.toLowerCase()
          );
        }).length;

        const patchedLineCountForComponent = Array.from(patchedLines).filter(
          (lineId) => {
            const lineComponentId = componentByLineId[lineId];
            return (
              lineComponentId.toLowerCase() === entry.componentId.toLowerCase()
            );
          },
        ).length;

        if (
          nodeElement != null &&
          patchedLineCountForComponent === lineCountForComponent
        ) {
          // All SVG lines connected to this station for the entry's component have been patched out
          const componentElement: SVGGElement | null =
            nodeElement.querySelector(
              `[id^='${entry.componentId.toLowerCase()}']`,
            );
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
      const labelElements = [...labelsElement.querySelectorAll('text')];
      for (const labelElement of labelElements) {
        const stationId = labelElement.id.replace(/^label_/, '').toUpperCase();
        const tspans = [...labelElement.querySelectorAll('tspan')];
        if (!(stationId in stationTranslatedNames)) {
          continue;
        }
        const segments = segmentText(
          stationTranslatedNames[stationId],
          intl.locale,
        );
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
        labelElement.removeAttribute('fill');
        labelElement.classList.add(
          'fill-gray-800',
          'dark:fill-gray-300',
          'hover:underline',
        );

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
            navigate(href);
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
        titleElement.textContent = stationTranslatedNames[stationId];
      }
    }
  }, [ref, stationIdsAffected, stationTranslatedNames, intl.locale, navigate]);

  const defaultTab = useMemo(() => {
    if (currentDate == null) {
      return '2025-04';
    }
    const dateTime = DateTime.fromISO(currentDate);
    assert(dateTime.isValid);
    if (dateTime >= DateTime.fromObject({ year: 2030, month: 12 })) {
      return '2030-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2029, month: 12 })) {
      return '2029-12';
    }
    if (dateTime >= DateTime.fromObject({ year: 2027, month: 12 })) {
      return '2027-12';
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

  return (
    <div className="flex flex-col fill-gray-800 dark:fill-gray-50">
      {/* Tailwind Class trappers */}
      <div className="hidden fill-gray-800 stroke-gray-800 dark:fill-gray-300 dark:stroke-gray-300" />

      <Tabs.Root defaultValue={defaultTab}>
        <Tabs.List className="flex items-center overflow-x-scroll border-gray-400 border-b [scrollbar-width:thin]">
          <Tabs.Trigger
            value="2030-12"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2030-12" year="numeric" month="short" />
            <ClockIcon className="size-4 shrink-0" />
          </Tabs.Trigger>{' '}
          <Tabs.Trigger
            value="2029-12"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2029-12" year="numeric" month="short" />
            <ClockIcon className="size-4 shrink-0" />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="2027-12"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2027-12" year="numeric" month="short" />
            <ClockIcon className="size-4 shrink-0" />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="2025-04"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2025-04" year="numeric" month="short" />
            <StarIcon className="size-4 shrink-0" />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="2024-11"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2024-11" year="numeric" month="short" />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="2019-12"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2019-12" year="numeric" month="short" />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="2017-11"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2017-11" year="numeric" month="short" />
          </Tabs.Trigger>
          <Tabs.Trigger
            value="2012-01"
            className="flex shrink-0 cursor-pointer items-center gap-x-1.5 border-gray-300 border-b px-4 py-2 text-gray-700 text-sm data-[state=active]:text-gray-800 data-[state=active]:shadow-[inset_0_-1px_0_0,0_1px_0_0] data-[state=active]:shadow-current dark:text-gray-500 dark:data-[state=active]:text-gray-200"
          >
            <FormattedDate value="2012-01" year="numeric" month="short" />
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="2030-12">
          <MapDec2030 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2029-12">
          <MapDec2029 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2027-12">
          <MapDec2027 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2025-04">
          <MapApr2025 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2024-11">
          <MapNov2024 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2019-12">
          <MapDec2019 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2017-11">
          <MapNov2017 ref={setRef} />
        </Tabs.Content>
        <Tabs.Content value="2012-01">
          <MapJan2012 ref={setRef} />
        </Tabs.Content>
      </Tabs.Root>

      {stationIds.size > 0 && (
        <>
          <span className="font-bold text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{
                count: stationIds.size,
              }}
            />
          </span>
          <span className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedList
              value={Array.from(stationIds).map((stationId) => {
                return (
                  <Link
                    className="hover:underline"
                    key={stationId}
                    to={buildLocaleAwareLink(
                      `/stations/${stationId}`,
                      intl.locale,
                    )}
                  >
                    {stationTranslatedNames[stationId] ?? stationId}
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
