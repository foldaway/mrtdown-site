import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import type { Component } from '../../../types';

interface Props {
  componentId: string;
}

export const ComponentPill: React.FC<Props> = (props) => {
  const { componentId } = props;

  const intl = useIntl();

  const { data } = useQuery<Component>({
    queryKey: ['components', componentId],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.org/source/component/${componentId}.json`,
      ).then((r) => r.json()),
  });

  if (data == null) {
    return (
      <span className="ms-2 rounded-sm bg-gray-400 px-2 py-0.5 font-semibold text-white text-xs">
        {componentId}
      </span>
    );
  }

  return (
    <Link
      className="inline-flex items-center transition-transform duration-75 hover:scale-105"
      to={buildLocaleAwareLink(`/lines/${componentId}`, intl.locale)}
    >
      <span
        className="rounded-sm px-2 py-1 font-semibold text-white text-xs leading-none"
        style={{ backgroundColor: data.color }}
      >
        {data.id}
      </span>
    </Link>
  );
};
