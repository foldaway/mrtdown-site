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
import { ScheduledArrivalStatus } from './ScheduledArrivalStatus';
import type { BranchArrivalState } from './stationArrivalRefresh';
import type { ArrivalTiming } from './stationGuide.types';

type ServiceArrivalSummaryProps = {
  arrivalTiming: ArrivalTiming;
  arrivalState?: BranchArrivalState;
  lineColor: string;
  now: number | null;
  onArrivalReported?: () => Promise<void>;
};

export function ServiceArrivalSummary({
  arrivalTiming,
  arrivalState,
  lineColor,
  now,
  onArrivalReported,
}: ServiceArrivalSummaryProps) {
  const reportPanelId = useId();
  const [reportExpanded, setReportExpanded] = useState(false);
  const data = arrivalState?.data;
  const report = data?.recentCrowdArrival;
  const recentReport =
    report && now != null && now < Date.parse(report.expiresAt) ? report : null;
  const hasDepartures =
    data?.source === 'scheduled' &&
    data.timings.some(({ departures }) => departures.length > 0);
  const reportable =
    data &&
    (hasDepartures ||
      (data.scope.stationId !== data.scope.destinationStationId &&
        (data.source === 'unavailable' || !data.coverage.complete)));
  const reportForm =
    reportable && onArrivalReported ? (
      <CrowdArrivalReport
        key={JSON.stringify(data.scope)}
        expanded={reportExpanded}
        panelId={reportPanelId}
        scope={{
          stationId: data.scope.stationId,
          lineId: data.scope.lineId,
          serviceId: data.scope.serviceId,
          destinationStationId: data.scope.destinationStationId,
        }}
        onSubmitted={onArrivalReported}
      />
    ) : null;
  const heading = <ArrivalServiceHeading timing={arrivalTiming} />;
  const reportButton = reportForm ? (
    <ArrivalReportButton
      expanded={reportExpanded}
      panelId={reportPanelId}
      onToggle={() => setReportExpanded((open) => !open)}
    />
  ) : null;
  return (
    <li className="py-2">
      {data?.source === 'scheduled' ? (
        <ScheduledArrivalStatus
          data={data}
          hasDepartures={hasDepartures}
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
        <ArrivalRefreshNotice state={arrivalState} />
      )}
      {recentReport && <RecentCrowdArrival report={recentReport} />}
      {reportForm}
    </li>
  );
}
