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
    <div className="flex overflow-hidden rounded-md">
      {Object.entries(station.componentMembers).map(
        ([componentId, componentMembers]) => (
          <Fragment key={componentId}>
            {componentMembers.map((member) => (
              <div
                key={member.code}
                className="z-10 flex h-4 w-10 items-center justify-center px-1.5"
                style={{
                  backgroundColor: componentsById[componentId].color,
                }}
              >
                <span className="font-semibold text-white text-xs leading-none">
                  {member.code}
                </span>
              </div>
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
};
