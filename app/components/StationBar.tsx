import type React from 'react';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import type { Station } from '~/types';

interface Props {
  memberships: Station['memberships'];
}

export const StationBar: React.FC<Props> = (props) => {
  const { memberships } = props;

  const { lines } = useIncludedEntities();

  return (
    <div className="flex overflow-hidden rounded-md">
      {memberships.map((membership) => (
        <div
          key={membership.code}
          className="z-10 flex h-4 w-10 items-center justify-center px-1.5"
          style={{
            backgroundColor: lines[membership.lineId]?.color ?? '#6b7280',
          }}
        >
          <span className="font-semibold text-white text-xs leading-none">
            {membership.code}
          </span>
        </div>
      ))}
    </div>
  );
};
