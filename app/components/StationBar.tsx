import type React from 'react';
import { Fragment } from 'react';
import type { Component, Station } from '~/types';

interface Props {
  station: Station;
  componentsById: Record<string, Component>;
}

export const StationBar: React.FC<Props> = (props) => {
  const { station, componentsById } = props;

  return (
    <div className="grid auto-cols-fr grid-flow-col divide-x divide-gray-50 dark:divide-gray-900">
      {Object.entries(station.componentMembers).map(
        ([componentId, componentMembers]) => (
          <Fragment key={componentId}>
            {componentMembers.map((member) => (
              <span
                key={member.code}
                className="px-1.5 py-1 text-center font-semibold text-white text-xs leading-none first:rounded-tl-md first:rounded-bl-md last:rounded-tr-md last:rounded-br-md"
                style={{
                  backgroundColor: componentsById[componentId].color,
                }}
              >
                {member.code}
              </span>
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
};
