import { ArrivalRefreshNotice } from './ArrivalRefreshNotice';
import { useArrivalReportButton } from './ArrivalReports';
import { ArrivalServiceHeading } from './ArrivalServiceHeading';
import { ArrivalServiceRow } from './ArrivalServiceRow';
import { ArrivalTimingDisplay, NoArrivalTimes } from './ArrivalTimingDisplay';
import { RecentCrowdArrival } from './CrowdArrivalReport';
import {
  type ArrivalSummaryMember,
  sharedArrivalDisplay,
} from './groupArrivalSummaries';
import { ScheduledArrivalStatus } from './ScheduledArrivalStatus';
import type { BranchArrivalState } from './stationArrivalRefresh';
import type { ArrivalTiming } from './stationGuide.types';

type ServiceArrivalSummaryProps = {
  arrivalTiming: ArrivalTiming;
  arrivalState?: BranchArrivalState;
  sharedArrivals?: ArrivalSummaryMember[];
  showReports?: boolean;
  lineColor: string;
  now: number | null;
};

export function ServiceArrivalSummary({
  arrivalTiming,
  arrivalState,
  sharedArrivals = [],
  showReports = true,
  lineColor,
  now,
}: ServiceArrivalSummaryProps) {
  const data = arrivalState?.data;
  const members = [
    { arrivalTiming, arrivalState, showReports },
    ...sharedArrivals,
  ];
  const sharedDisplay = sharedArrivalDisplay(members);
  const heading = (
    <ArrivalServiceHeading
      timing={arrivalTiming}
      additionalTimings={sharedArrivals.map(
        ({ arrivalTiming }) => arrivalTiming,
      )}
    />
  );
  const reportButton = useArrivalReportButton(members);
  return (
    <li className="py-1.5">
      {data?.source === 'scheduled' ? (
        <ScheduledArrivalStatus
          data={sharedDisplay?.data ?? data}
          departureServices={sharedDisplay?.departureServices}
          heading={heading}
          reportButton={reportButton}
          lineColor={lineColor}
          now={arrivalState?.status === 'error' ? null : now}
        />
      ) : (
        <ArrivalServiceRow
          heading={heading}
          lineColor={lineColor}
          platformLabels={arrivalTiming.platformLabels}
        >
          {data?.source === 'unavailable' ||
          arrivalTiming.destinationStationId == null ? (
            <ArrivalTimingDisplay reportButton={reportButton}>
              <NoArrivalTimes />
            </ArrivalTimingDisplay>
          ) : null}
        </ArrivalServiceRow>
      )}
      {arrivalTiming.destinationStationId != null && (
        <ArrivalRefreshNotice
          state={
            members.find((member) => member.arrivalState?.status === 'loading')
              ?.arrivalState ?? arrivalState
          }
        />
      )}
      {members.map(({ arrivalTiming, arrivalState, showReports }) => {
        const report = arrivalState?.data?.recentCrowdArrival;
        if (
          showReports === false ||
          !report ||
          now == null ||
          now >= Date.parse(report.expiresAt)
        )
          return null;
        return (
          <div key={arrivalTiming.serviceId}>
            {sharedArrivals.length > 0 && (
              <ArrivalServiceHeading timing={arrivalTiming} />
            )}
            <RecentCrowdArrival report={report} />
          </div>
        );
      })}
    </li>
  );
}
