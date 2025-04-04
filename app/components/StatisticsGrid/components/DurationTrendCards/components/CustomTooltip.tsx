import type React from 'react';
import { displayMsFormatter } from '../helpers/formatters';
import type { Data } from '../types';

interface Props {
  active?: boolean;
  payload?: {
    payload?: Data;
    value?: number;
  }[];
  label?: string;
}

export const CustomTooltip: React.FC<Props> = (props) => {
  const { active, payload, label } = props;

  if (!active) {
    return null;
  }

  const data = payload?.[0]?.payload;

  return (
    <div className="flex flex-col rounded border border-gray-300 bg-gray-50 px-4 py-1 dark:border-gray-700 dark:bg-gray-800">
      <span className="mb-1 text-gray-900 text-xs dark:text-gray-50">
        {label}
      </span>
      <div className="flex items-center justify-between gap-x-2">
        <div className="flex items-center">
          <div className="size-2 rounded-full bg-disruption-major-light dark:bg-disruption-major-dark" />
        </div>
        <span className="text-gray-400 text-xs dark:text-gray-500">
          Disruption
        </span>
        <span className="ms-auto text-xs">
          {displayMsFormatter(data?.durationMsByIssueType?.disruption ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-x-2">
        <div className="flex items-center">
          <div className="size-2 rounded-full bg-maintenance-light dark:bg-maintenance-dark" />
        </div>
        <span className="text-gray-400 text-xs dark:text-gray-500">
          Maintenance
        </span>
        <span className="ms-auto text-xs">
          {displayMsFormatter(data?.durationMsByIssueType?.maintenance ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-x-2">
        <div className="flex items-center">
          <div className="size-2 rounded-full bg-infra-light dark:bg-infra-dark" />
        </div>
        <span className="text-gray-400 text-xs dark:text-gray-500">Infra</span>
        <span className="ms-auto text-xs">
          {displayMsFormatter(data?.durationMsByIssueType?.infra ?? 0)}
        </span>
      </div>
    </div>
  );
};
