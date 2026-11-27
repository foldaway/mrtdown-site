import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from 'react';
import { ArrivalServiceHeading } from './ArrivalServiceHeading';
import { ArrivalReportButton, CrowdArrivalReport } from './CrowdArrivalReport';
import type { ArrivalSummaryMember } from './groupArrivalSummaries';
import { type ArrivalStates, arrivalBranchKey } from './stationArrivalRefresh';
import type { ArrivalTiming } from './stationGuide.types';

type ReportControl = {
  panelId: string;
  expanded: boolean;
  reportable: boolean;
};
const ReportContext = createContext<{
  branches: Map<string, ReportControl>;
  toggle: (keys: string[]) => void;
} | null>(null);

function branchKey(timing: ArrivalTiming) {
  return arrivalBranchKey(
    timing.lineId,
    timing.serviceId,
    timing.destinationStationId,
  );
}

type ArrivalReportsProps = {
  stationId: string;
  timings: ArrivalTiming[];
  states: ArrivalStates;
  onArrivalReported?: () => Promise<void>;
  children: ReactNode;
};

/** Own report state and mounted forms independently of the changing arrival rows. */
export function ArrivalReports({
  stationId,
  timings,
  states,
  onArrivalReported,
  children,
}: ArrivalReportsProps) {
  const id = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const branches = new Map<string, ReportControl>();
  for (const timing of timings) {
    const key = branchKey(timing);
    const data = states[key]?.data;
    branches.set(key, {
      panelId: `${id}-${encodeURIComponent(key)}`,
      expanded: expanded.has(key),
      reportable: Boolean(
        data &&
          ((data.source === 'scheduled' &&
            data.timings.some(({ departures }) => departures.length > 0)) ||
            (data.scope.stationId !== data.scope.destinationStationId &&
              (data.source === 'unavailable' || !data.coverage.complete))),
      ),
    });
  }
  if (!onArrivalReported) return children;
  return (
    <ReportContext.Provider
      value={{
        branches,
        toggle: (keys) =>
          setExpanded((current) => {
            const close = keys.every((key) => current.has(key));
            const next = new Set(current);
            for (const key of keys) {
              if (close) next.delete(key);
              else next.add(key);
            }
            return next;
          }),
      }}
    >
      {children}
      {[...new Map(timings.map((timing) => [branchKey(timing), timing]))].map(
        ([key, timing]) => {
          if (timing.destinationStationId == null) return null;
          const control = branches.get(key);
          if (!control) return null;
          const visible = control.expanded && control.reportable;
          return (
            <div
              className="mt-2"
              hidden={!visible}
              id={control.panelId}
              key={key}
            >
              <ArrivalServiceHeading timing={timing} />
              <CrowdArrivalReport
                expanded={visible}
                panelId={`${control.panelId}-form`}
                scope={{
                  stationId,
                  lineId: timing.lineId,
                  serviceId: timing.serviceId,
                  destinationStationId: timing.destinationStationId,
                }}
                onSubmitted={onArrivalReported}
              />
            </div>
          );
        },
      )}
    </ReportContext.Provider>
  );
}

export function useArrivalReportButton(members: ArrivalSummaryMember[]) {
  const context = useContext(ReportContext);
  if (!context) return null;
  const keys = members
    .filter(({ showReports }) => showReports !== false)
    .map(({ arrivalTiming }) => branchKey(arrivalTiming))
    .filter((key) => context.branches.get(key)?.reportable);
  if (!keys.length) return null;
  return (
    <ArrivalReportButton
      panelId={keys.map((key) => context.branches.get(key)?.panelId).join(' ')}
      expanded={keys.every((key) => context.branches.get(key)?.expanded)}
      onToggle={() => context.toggle(keys)}
    />
  );
}
