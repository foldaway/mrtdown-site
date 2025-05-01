import { useQuery } from '@tanstack/react-query';
import type { Component } from '../../../types';
import { useIntl } from 'react-intl';

interface Props {
  componentId: string;
  showName?: boolean;
}

export const ComponentPill: React.FC<Props> = (props) => {
  const { componentId, showName } = props;

  const intl = useIntl();

  const { data } = useQuery<Component>({
    queryKey: ['components', componentId],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.foldaway.space/source/component/${componentId}.json`,
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
    <>
      <span
        className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
        style={{ backgroundColor: data.color }}
      >
        {data.id}
      </span>
      {showName && (
        <span className="text-sm">
          {data.title_translations[intl.locale] ?? data.title}
        </span>
      )}
    </>
  );
};
