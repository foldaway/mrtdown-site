import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Line } from '~/client';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

interface Props {
  component: Line;
}

export const LinePill: React.FC<Props> = (props) => {
  const { component } = props;

  const intl = useIntl();

  return (
    <Link
      className="inline-flex items-center transition-transform duration-75 hover:scale-105"
      to={buildLocaleAwareLink(`/lines/${component.id}`, intl.locale)}
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
