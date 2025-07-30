import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
} from 'recharts';
import type { Component, Statistics } from '../../../types';

interface Data {
  line: string;
  count: number;
}

interface TickProps extends React.SVGProps<SVGElement> {
  x: number;
  y: number;
  payload: {
    value: string;
  };
}

const Tick: React.FC<TickProps> = (props) => {
  const { x, y, payload } = props;

  const componentId = payload.value;

  const { data } = useQuery<Component>({
    queryKey: ['components', componentId],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.org/source/component/${componentId}.json`,
      ).then((r) => r.json()),
  });

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
        fill={data?.color}
        x={-21}
        y={1}
        width={42}
        height={20}
        rx={6}
        ry={6}
      />
      <text
        ref={setTextRef}
        x={0}
        y={0}
        dy={16}
        textAnchor="middle"
        fill="white"
      >
        {payload.value}
      </text>
    </g>
  );
};

interface Props {
  statistics: Statistics;
}

export const ComponentDisruptionsCountCard: React.FC<Props> = (props) => {
  const { statistics } = props;

  const chartData = useMemo<Data[]>(() => {
    return Object.entries(statistics.componentsIssuesDisruptionCount).map(
      ([componentId, count]) => {
        return {
          line: componentId,
          count,
        };
      },
    );
  }, [statistics.componentsIssuesDisruptionCount]);

  return (
    <div className="flex flex-col justify-between rounded-lg border border-gray-300 p-6 shadow-lg sm:col-span-2 dark:border-gray-700">
      <span className="text-base">
        <FormattedMessage
          id="general.disruptions_by_line"
          defaultMessage="Disruptions by line"
        />
      </span>
      <div className="h-48">
        <ResponsiveContainer>
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="horizontal"
            margin={{ top: 30, left: 5, right: 5, bottom: 5 }}
          >
            <CartesianGrid
              vertical={false}
              className="stroke-gray-300 dark:stroke-gray-600"
            />
            <XAxis
              type="category"
              dataKey="line"
              className="text-gray-600 text-sm dark:text-gray-300"
              // @ts-ignore
              tick={<Tick />}
            />
            <Bar
              dataKey="count"
              className="fill-gray-700 dark:fill-gray-200"
              stroke=""
              radius={5}
              type="monotone"
              strokeWidth={2}
            >
              <LabelList
                position="top"
                offset={12}
                className="fill-foreground stroke-gray-400 text-sm dark:stroke-gray-500"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
