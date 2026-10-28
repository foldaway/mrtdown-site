import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArrivalLine } from './stationGuide.types';
import {
  type ArrivalStates,
  createArrivalRefresh,
} from './stationArrivalRefresh';

export function useStationArrivals(stationId: string, lines: ArrivalLine[]) {
  const [snapshot, setSnapshot] = useState<{
    stationId: string;
    states: ArrivalStates;
  } | null>(null);
  const session = useRef<ReturnType<typeof createArrivalRefresh> | null>(null);
  useEffect(() => {
    const current = createArrivalRefresh(stationId, lines, (states) =>
      setSnapshot({ stationId, states }),
    );
    session.current = current;
    void current.refresh();
    const interval = window.setInterval(() => void current.refresh(), 30_000);
    return () => {
      current.dispose();
      window.clearInterval(interval);
      session.current = null;
    };
  }, [stationId, lines]);
  const afterReport = useCallback(
    () => session.current?.refresh(true) ?? Promise.resolve(),
    [],
  );
  return {
    states: snapshot?.stationId === stationId ? snapshot.states : {},
    afterReport,
  };
}
