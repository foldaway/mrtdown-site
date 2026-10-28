import { useEffect, useState } from 'react';
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
  useEffect(() => {
    const current = createArrivalRefresh(stationId, lines, (states) =>
      setSnapshot({ stationId, states }),
    );
    void current.refresh();
    const interval = window.setInterval(() => void current.refresh(), 30_000);
    return () => {
      current.dispose();
      window.clearInterval(interval);
    };
  }, [stationId, lines]);
  return snapshot?.stationId === stationId ? snapshot.states : {};
}
