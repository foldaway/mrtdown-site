import type { ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';

type ArrivalTimingDisplayProps = {
  children: ReactNode;
  reportButton?: ReactNode;
};

export function ArrivalTimingDisplay({
  children,
  reportButton,
}: ArrivalTimingDisplayProps) {
  return (
    <div className="rounded-lg bg-gray-50 ring-1 ring-gray-200/80 ring-inset dark:bg-gray-900/45 dark:ring-white/10">
      <div className="flex min-h-11 flex-wrap content-center items-baseline gap-x-2.5 gap-y-1 px-1.5 py-1.5 text-start tabular-nums sm:px-3">
        {children}
      </div>
      {reportButton && (
        <div className="mx-1.5 flex justify-start border-gray-200/75 border-t sm:mx-3 dark:border-white/10">
          <div className="-ms-1">{reportButton}</div>
        </div>
      )}
    </div>
  );
}

type NoArrivalTimesProps = { emptyWindow?: boolean };

export function NoArrivalTimes({ emptyWindow }: NoArrivalTimesProps) {
  return (
    <div aria-live="polite">
      <p
        aria-hidden="true"
        className="font-medium text-gray-600 text-lg leading-none dark:text-gray-400"
      >
        <FormattedMessage
          id="station.arrivals.not_available"
          defaultMessage="N/A"
        />
      </p>
      <p className="mt-1 text-gray-600 text-xs leading-snug dark:text-gray-400">
        {emptyWindow ? (
          <FormattedMessage
            id="station.arrivals.empty_window"
            defaultMessage="No departures in this window"
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.timetable_unavailable"
            defaultMessage="Timetable unavailable"
          />
        )}
      </p>
    </div>
  );
}
