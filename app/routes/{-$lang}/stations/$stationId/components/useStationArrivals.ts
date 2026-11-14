import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ArrivalStates,
  createArrivalRefresh,
} from './stationArrivalRefresh';
import type { ArrivalLine } from './stationGuide.types';

export function useStationArrivals(stationId: string, lines: ArrivalLine[]) {
  const session = useRef<ReturnType<typeof createArrivalRefresh> | null>(null);
  const [snapshot, setSnapshot] = useState<{
    stationId: string;
    states: ArrivalStates;
  } | null>(null);
  useEffect(() => {
    const current = createArrivalRefresh(stationId, lines, (states) =>
      setSnapshot({ stationId, states }),
    );
    session.current = current;
    void current.refresh();
    const interval = window.setInterval(() => void current.refresh(), 30_000);
    return () => {
      session.current = null;
      current.dispose();
      window.clearInterval(interval);
    };
  }, [stationId, lines]);
  const refreshAfterReport = useCallback(async () => {
    await session.current?.refreshAfterReport();
  }, []);
  return {
    states: snapshot?.stationId === stationId ? snapshot.states : {},
    refreshAfterReport,
  };
}
