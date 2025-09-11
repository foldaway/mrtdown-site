import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

interface TickProps extends React.SVGProps<SVGElement> {
  x: number;
  y: number;
  payload: {
    value: string;
  };
}

export const Tick: React.FC<TickProps> = (props) => {
  const { x, y, payload } = props;

  const intl = useIntl();
  const stationId = payload.value;
  const { stations } = useIncludedEntities();
  const station = useMemo(() => {
    return stations[stationId];
  }, [stations, stationId]);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dx={-10}
        dy={4}
        textAnchor="end"
        transform="rotate(-90)"
        className="fill-gray-800 font-medium text-xs tracking-wide dark:fill-gray-200"
        style={{
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          letterSpacing: '0.025em',
        }}
      >
        {station.nameTranslations[intl.locale] ?? station.name}
      </text>
    </g>
  );
};
