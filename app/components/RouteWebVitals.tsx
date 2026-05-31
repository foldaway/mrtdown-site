import { usePostHog } from '@posthog/react';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { getRouteTelemetryPath } from '~/helpers/getRouteTelemetryPath';

type LayoutShiftEntry = PerformanceEntry & {
  hadRecentInput: boolean;
  value: number;
};

type EventTimingEntry = PerformanceEntry & {
  interactionId?: number;
};

type WebVitalName = 'CLS' | 'FCP' | 'INP' | 'LCP';

type MetricValue = {
  route: string;
  value: number;
};

type ClsSessionWindow = {
  currentStartTime: number | null;
  currentLastEntryTime: number | null;
  currentValue: number;
  maxValue: number;
};

const MAX_CLS_SESSION_GAP_MS = 1000;
const MAX_CLS_SESSION_DURATION_MS = 5000;

function createClsSessionWindow(): ClsSessionWindow {
  return {
    currentStartTime: null,
    currentLastEntryTime: null,
    currentValue: 0,
    maxValue: 0,
  };
}

export function RouteWebVitals() {
  const posthog = usePostHog();
  const route = useRouterState({
    select: (state) => getRouteTelemetryPath(state.location.pathname),
  });
  const routeRef = useRef(route);
  const reportRouteMetricsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (routeRef.current !== route) {
      reportRouteMetricsRef.current?.();
    }
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      typeof window === 'undefined' ||
      !('PerformanceObserver' in window)
    ) {
      return;
    }

    const supportsEntryType = (entryType: string) =>
      PerformanceObserver.supportedEntryTypes?.includes(entryType) ?? false;

    const captureMetric = (
      metric: WebVitalName,
      value: number,
      routeForMetric: string,
    ) => {
      if (!Number.isFinite(value)) {
        return;
      }

      posthog.capture('web_vital', {
        metric,
        value,
        route: routeForMetric,
      });
    };

    const observers: PerformanceObserver[] = [];
    const pendingRecordDrainers: Array<() => void> = [];
    let clsSessionWindow = createClsSessionWindow();
    let hasClsSupport = false;
    let hasPendingRouteMetrics = false;
    let largestContentfulPaint: MetricValue | null = null;
    let maxInteractionDuration: MetricValue | null = null;
    let reportedFinalMetrics = false;

    const resetRouteMetrics = () => {
      clsSessionWindow = createClsSessionWindow();
      hasPendingRouteMetrics = false;
      largestContentfulPaint = null;
      maxInteractionDuration = null;
    };

    const reportCurrentRouteMetrics = () => {
      if (!hasPendingRouteMetrics) {
        return;
      }

      if (largestContentfulPaint != null) {
        captureMetric(
          'LCP',
          largestContentfulPaint.value,
          largestContentfulPaint.route,
        );
      }

      if (hasClsSupport) {
        captureMetric('CLS', clsSessionWindow.maxValue, routeRef.current);
      }

      if (maxInteractionDuration != null) {
        captureMetric(
          'INP',
          maxInteractionDuration.value,
          maxInteractionDuration.route,
        );
      }

      resetRouteMetrics();
    };

    const drainPendingRecords = () => {
      for (const drainPendingRecords of pendingRecordDrainers) {
        drainPendingRecords();
      }
    };

    const flushCurrentRouteMetrics = () => {
      drainPendingRecords();
      reportCurrentRouteMetrics();
    };

    reportRouteMetricsRef.current = flushCurrentRouteMetrics;

    const processPaintEntries = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') {
          captureMetric('FCP', entry.startTime, routeRef.current);
          hasPendingRouteMetrics = true;
        }
      }
    };

    const processLcpEntries = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        largestContentfulPaint = {
          route: routeRef.current,
          value: entry.startTime,
        };
        hasPendingRouteMetrics = true;
      }
    };

    const processClsEntries = (entries: LayoutShiftEntry[]) => {
      for (const entry of entries) {
        if (entry.hadRecentInput) {
          continue;
        }

        const currentStartTime = clsSessionWindow.currentStartTime;
        const currentLastEntryTime = clsSessionWindow.currentLastEntryTime;
        const startsNewSession =
          currentStartTime == null ||
          currentLastEntryTime == null ||
          entry.startTime - currentLastEntryTime > MAX_CLS_SESSION_GAP_MS ||
          entry.startTime - currentStartTime > MAX_CLS_SESSION_DURATION_MS;

        if (startsNewSession) {
          clsSessionWindow.currentStartTime = entry.startTime;
          clsSessionWindow.currentValue = entry.value;
        } else {
          clsSessionWindow.currentValue += entry.value;
        }

        clsSessionWindow.currentLastEntryTime = entry.startTime;
        clsSessionWindow.maxValue = Math.max(
          clsSessionWindow.maxValue,
          clsSessionWindow.currentValue,
        );
        hasPendingRouteMetrics = true;
      }
    };

    const processEventEntries = (entries: EventTimingEntry[]) => {
      for (const entry of entries) {
        if (entry.interactionId != null && entry.interactionId > 0) {
          const value = entry.duration;
          if (
            maxInteractionDuration == null ||
            value > maxInteractionDuration.value
          ) {
            maxInteractionDuration = {
              route: routeRef.current,
              value,
            };
            hasPendingRouteMetrics = true;
          }
        }
      }
    };

    if (supportsEntryType('paint')) {
      const paintObserver = new PerformanceObserver((entryList) => {
        processPaintEntries(entryList.getEntries());
      });
      paintObserver.observe({ type: 'paint', buffered: true });
      pendingRecordDrainers.push(() =>
        processPaintEntries(paintObserver.takeRecords()),
      );
      observers.push(paintObserver);
    }

    if (supportsEntryType('largest-contentful-paint')) {
      const lcpObserver = new PerformanceObserver((entryList) => {
        processLcpEntries(entryList.getEntries());
      });
      lcpObserver.observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
      pendingRecordDrainers.push(() =>
        processLcpEntries(lcpObserver.takeRecords()),
      );
      observers.push(lcpObserver);
    }

    if (supportsEntryType('layout-shift')) {
      hasClsSupport = true;
      const clsObserver = new PerformanceObserver((entryList) => {
        processClsEntries(entryList.getEntries() as LayoutShiftEntry[]);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      pendingRecordDrainers.push(() =>
        processClsEntries(clsObserver.takeRecords() as LayoutShiftEntry[]),
      );
      observers.push(clsObserver);
    }

    if (supportsEntryType('event')) {
      const inpObserver = new PerformanceObserver((entryList) => {
        processEventEntries(entryList.getEntries() as EventTimingEntry[]);
      });
      inpObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 40,
      } as PerformanceObserverInit);
      pendingRecordDrainers.push(() =>
        processEventEntries(inpObserver.takeRecords() as EventTimingEntry[]),
      );
      observers.push(inpObserver);
    }

    const reportFinalMetrics = () => {
      if (reportedFinalMetrics) {
        return;
      }

      reportedFinalMetrics = true;
      flushCurrentRouteMetrics();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentRouteMetrics();
      }
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        flushCurrentRouteMetrics();
        return;
      }

      reportFinalMetrics();
      reportRouteMetricsRef.current = null;
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        reportedFinalMetrics = false;
        reportRouteMetricsRef.current = flushCurrentRouteMetrics;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      reportRouteMetricsRef.current = null;
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [posthog]);

  return null;
}
