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
    <div className="flex min-h-10 flex-col items-stretch justify-center gap-x-2 rounded-lg bg-gray-50 px-2 text-start ring-1 ring-gray-200/80 ring-inset sm:flex-row dark:bg-gray-900/45 dark:ring-white/10">
      <div className="flex w-full min-w-0 flex-col justify-center sm:w-auto sm:flex-1">
        {children}
      </div>
      {reportButton && (
        <div className="flex shrink-0 items-center pb-1 sm:py-1.5">
          {reportButton}
        </div>
      )}
    </div>
  );
}

type ArrivalTimeValueProps = {
  children: ReactNode;
  clock?: boolean;
  secondary?: boolean;
};

export function ArrivalTimeValue({
  children,
  clock,
  secondary,
}: ArrivalTimeValueProps) {
  return (
    <span
      className={`font-semibold leading-none ${clock ? 'text-sm' : 'text-lg sm:text-xl'} ${secondary ? 'text-gray-600 dark:text-gray-400' : 'text-gray-950 dark:text-white'}`}
    >
      {children}
    </span>
  );
}

type NoArrivalTimesProps = { emptyWindow?: boolean; elapsed?: boolean };

export function NoArrivalTimes({ emptyWindow, elapsed }: NoArrivalTimesProps) {
  return (
    <p
      aria-live="polite"
      className="py-1.5 text-gray-600 text-xs leading-relaxed dark:text-gray-400"
    >
      {emptyWindow ? (
        elapsed ? (
          <FormattedMessage
            id="station.arrivals.no_upcoming_times"
            defaultMessage="No upcoming times"
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.empty_window"
            defaultMessage="None in the next hour"
          />
        )
      ) : (
        <FormattedMessage
          id="station.arrivals.timetable_unavailable"
          defaultMessage="Timetable unavailable"
        />
      )}
    </p>
  );
}
