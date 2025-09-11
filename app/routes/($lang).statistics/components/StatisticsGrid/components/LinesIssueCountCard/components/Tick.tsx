import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

const TEXT_PADDING_WIDTH = 12;

interface TickProps extends React.SVGProps<SVGElement> {
  x: number;
  y: number;
  payload: {
    value: string;
  };
}

export const Tick: React.FC<TickProps> = (props) => {
  const { x, y, payload } = props;

  const componentId = payload.value;
  const { lines } = useIncludedEntities();
  const line = useMemo(() => lines[componentId], [lines, componentId]);

  const [textRef, setTextRef] = useState<SVGTextElement | null>(null);
  const rectRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    if (textRef == null) {
      return;
    }
    const textWidth = textRef.getComputedTextLength();
    const paddedWidth = textWidth + TEXT_PADDING_WIDTH;
    rectRef.current?.setAttribute('width', paddedWidth.toFixed(4));
    rectRef.current?.setAttribute('x', `-${paddedWidth}`);
  }, [textRef]);

  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        ref={rectRef}
        fill={line.color}
        x={0}
        y={-10}
        width={42}
        height={20}
        transform="rotate(-90)"
        rx={6}
        ry={6}
      />
      <text
        className="text-xs"
        ref={setTextRef}
        x={0}
        y={0}
        dx={-TEXT_PADDING_WIDTH / 2}
        dy={4}
        textAnchor="end"
        transform="rotate(-90)"
        fill="white"
      >
        {payload.value}
      </text>
    </g>
  );
};
