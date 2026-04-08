import { Link } from '@tanstack/react-router';
import type { Line } from '~/client';

interface Props {
  component: Line;
}

export const LinePill: React.FC<Props> = (props) => {
  const { component } = props;

  return (
    <Link
      className="inline-flex items-center transition-transform duration-75 hover:scale-105"
      to="/{-$lang}/lines/$lineId"
      params={{ lineId: component.id }}
    >
      <span
        className="rounded-sm px-2 py-1 font-semibold text-white text-xs leading-none"
        style={{ backgroundColor: component.color }}
      >
        {component.id}
      </span>
    </Link>
  );
};
