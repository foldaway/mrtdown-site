import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Treemap,
  XAxis,
} from 'recharts';
import type { Chart } from '~/client';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../../hooks/useHydrated';

interface TickProps extends React.SVGProps<SVGElement> {
  x: number;
  y: number;
  payload: {
    value: string;
  };
}

const Tick: React.FC<TickProps> = (props) => {
  const { x, y, payload } = props;

  const stationId = payload.value;
  const { stations } = useIncludedEntities();
  const station = useMemo(() => {
    return stations[stationId];
  }, [stations, stationId]);

  const [textRef, setTextRef] = useState<SVGTextElement | null>(null);
  const rectRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    if (textRef == null) {
      return;
    }
    const textWidth = textRef.getComputedTextLength();
    const paddedWidth = textWidth + 12;
    rectRef.current?.setAttribute('width', paddedWidth.toFixed(2));
    rectRef.current?.setAttribute('x', (-paddedWidth / 2).toFixed(2));
  }, [textRef]);

  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        ref={rectRef}
        // fill={data?.color}
        x={-21}
        y={1}
        width={42}
        height={20}
        rx={6}
        ry={6}
        transform="rotate(-35)"
      />
      <text
        ref={setTextRef}
        x={0}
        y={0}
        dy={16}
        textAnchor="middle"
        fill="white"
        transform="rotate(-35)"
      >
        {station.name}
      </text>
    </g>
  );
};

interface Props {
  chart: Chart;
}

export const StationsIssueCountCard: React.FC<Props> = (props) => {
  const { chart } = props;

  const intl = useIntl();

  const isHydrated = useHydrated();

  return (
    <>
      <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg sm:col-span-2 dark:border-gray-700">
        <span className="text-base">
          <FormattedMessage
            id="general.station_issue_counts"
            defaultMessage="Issue Count by Station"
          />
        </span>
        <div className="flex h-[600px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={chart.data}
              layout="horizontal"
              margin={{ top: 30, left: 5, right: 5, bottom: 5 }}
            >
              <CartesianGrid
                vertical={false}
                className="stroke-gray-300 dark:stroke-gray-600"
              />
              <XAxis
                type="category"
                dataKey="name"
                className="text-gray-600 text-sm dark:text-gray-300"
                // @ts-ignore
                tick={<Tick />}
              />
              <Bar
                dataKey="payload.disruption"
                className="fill-disruption-light dark:fill-disruption-dark"
                stroke=""
                type="monotone"
                strokeWidth={2}
                stackId="issueType"
              >
                <LabelList
                  position="inside"
                  offset={12}
                  className="fill-foreground stroke-gray-400 text-sm dark:stroke-gray-500"
                />
              </Bar>
              <Bar
                dataKey="payload.maintenance"
                className="fill-maintenance-light dark:fill-maintenance-dark"
                stroke=""
                type="monotone"
                strokeWidth={2}
                stackId="issueType"
              >
                <LabelList
                  position="inside"
                  offset={12}
                  className="fill-foreground stroke-gray-400 text-sm dark:stroke-gray-500"
                />
              </Bar>
              <Bar
                dataKey="payload.infra"
                className="fill-infra-light dark:fill-infra-dark"
                stroke=""
                type="monotone"
                strokeWidth={2}
                stackId="issueType"
              >
                <LabelList
                  position="inside"
                  offset={12}
                  className="fill-foreground stroke-gray-400 text-sm dark:stroke-gray-500"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2.5 flex max-h-40 flex-col overflow-y-scroll sm:max-h-[450px]">
          {/*{data.map(({ station, total }) => (
            <div
              key={station.id}
              className="flex items-center justify-between px-4 py-1 even:bg-gray-100 dark:even:bg-gray-800"
            >
              <div className="flex items-center gap-x-2">
                <StationBar
                  station={station}
                  componentsById={statistics.componentsById}
                />
                <div className="flex overflow-hidden rounded-md">
                  {station.memberships.map((membership) => (
                    <div
                      key={membership.code}
                      className="z-10 flex h-4 w-10 items-center justify-center px-1.5"
                      style={{
                        backgroundColor: membership.component.color,
                      }}
                    >
                      <span className="font-semibold text-white text-xs leading-none">
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
                  className="hover:underline"
                >
                  <span className="truncate text-sm">
                    {station.nameTranslations[intl.locale] ?? station.name}
                  </span>
                </Link>
              </div>
              <span className="font-bold text-sm">
                {isHydrated ? <FormattedNumber value={total} /> : total}
              </span>
            </div>
          ))}*/}
        </div>
      </div>
    </>
  );
};
