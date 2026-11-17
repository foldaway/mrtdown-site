import type { ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';
import { PlatformSign } from './StationGuideSigns';

type ArrivalServiceRowProps = {
  children?: ReactNode;
  heading: ReactNode;
  lineColor: string;
  platformLabels: string[];
  alternativePlatforms?: boolean;
};

export function ArrivalServiceRow({
  children,
  heading,
  lineColor,
  platformLabels,
  alternativePlatforms,
}: ArrivalServiceRowProps) {
  return (
    <div
      className={
        children != null
          ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,44%)] items-start gap-x-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)] sm:gap-x-4'
          : undefined
      }
    >
      <div className="flex min-h-11 min-w-0 items-center gap-2 sm:gap-3">
        {platformLabels.length > 0 ? (
          <ul className="flex max-w-[3.5rem] shrink-0 flex-wrap gap-1">
            {platformLabels.map((label) => (
              <li key={label}>
                <PlatformSign color={lineColor} label={label} />
              </li>
            ))}
          </ul>
        ) : (
          <span aria-hidden="true" className="w-6 shrink-0" />
        )}
        <div className="wrap-break-word min-w-0">
          {heading}
          {alternativePlatforms && (
            <p className="text-gray-600 text-xs dark:text-gray-400">
              <FormattedMessage
                id="station.arrivals.platform_alternatives"
                defaultMessage="Alternative platforms for the same train"
              />
            </p>
          )}
        </div>
      </div>
      {children != null && (
        <div className="wrap-break-word flex min-h-11 min-w-0 flex-col justify-center text-end">
          {children}
        </div>
      )}
    </div>
  );
}
