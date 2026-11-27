import { useId, useState } from 'react';
import { ArrivalRefreshNotice } from './ArrivalRefreshNotice';
import { ArrivalServiceHeading } from './ArrivalServiceHeading';
import { ArrivalServiceRow } from './ArrivalServiceRow';
import { ArrivalTimingDisplay, NoArrivalTimes } from './ArrivalTimingDisplay';
import {
  ArrivalReportButton,
  CrowdArrivalReport,
  RecentCrowdArrival,
} from './CrowdArrivalReport';
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
  onArrivalReported?: () => Promise<void>;
};

export function ServiceArrivalSummary({
  arrivalTiming,
  arrivalState,
  sharedArrivals = [],
  showReports = true,
  lineColor,
  now,
  onArrivalReported,
}: ServiceArrivalSummaryProps) {
  const reportPanelId = useId();
  const [reportExpanded, setReportExpanded] = useState(false);
  const data = arrivalState?.data;
  const members = [
    { arrivalTiming, arrivalState, showReports },
    ...sharedArrivals,
  ];
  const sharedDisplay = sharedArrivalDisplay(members);
  const reportable = members.filter(({ arrivalState, showReports }) => {
    const data = arrivalState?.data;
    return (
      showReports !== false &&
      data &&
      ((data.source === 'scheduled' &&
        data.timings.some(({ departures }) => departures.length > 0)) ||
        (data.scope.stationId !== data.scope.destinationStationId &&
          (data.source === 'unavailable' || !data.coverage.complete)))
    );
  });
  const reportData = reportable[0]?.arrivalState?.data;
  const reportForm =
    reportable.length > 0 && sharedArrivals.length > 0 && onArrivalReported ? (
      <div hidden={!reportExpanded} id={reportPanelId}>
        {reportable.map(({ arrivalTiming, arrivalState }, index) => {
          const data = arrivalState?.data;
          if (!data) return null;
          return (
            <div className="mt-2" key={JSON.stringify(data.scope)}>
              <ArrivalServiceHeading timing={arrivalTiming} />
              <CrowdArrivalReport
                expanded={reportExpanded}
                panelId={`${reportPanelId}-${index}`}
                scope={data.scope}
                onSubmitted={onArrivalReported}
              />
            </div>
          );
        })}
      </div>
    ) : reportable.length === 1 && reportData && onArrivalReported ? (
      <CrowdArrivalReport
        key={JSON.stringify(reportData.scope)}
        expanded={reportExpanded}
        panelId={reportPanelId}
        scope={{
          stationId: reportData.scope.stationId,
          lineId: reportData.scope.lineId,
          serviceId: reportData.scope.serviceId,
          destinationStationId: reportData.scope.destinationStationId,
        }}
        onSubmitted={onArrivalReported}
      />
    ) : null;
  const heading = (
    <ArrivalServiceHeading
      timing={arrivalTiming}
      additionalTimings={sharedArrivals.map(
        ({ arrivalTiming }) => arrivalTiming,
      )}
    />
  );
  const reportButton = reportForm ? (
    <ArrivalReportButton
      expanded={reportExpanded}
      panelId={reportPanelId}
      onToggle={() => setReportExpanded((open) => !open)}
    />
  ) : null;
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
      {reportForm}
    </li>
  );
}
