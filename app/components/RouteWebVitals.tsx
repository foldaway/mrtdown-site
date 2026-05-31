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
    let clsSessionWindow = createClsSessionWindow();
    let hasClsSupport = false;
    let largestContentfulPaint: MetricValue | null = null;
    let maxInteractionDuration: MetricValue | null = null;
    let reportedFinalMetrics = false;

    const resetRouteMetrics = () => {
      clsSessionWindow = createClsSessionWindow();
      largestContentfulPaint = null;
      maxInteractionDuration = null;
    };

    const reportCurrentRouteMetrics = () => {
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

    reportRouteMetricsRef.current = reportCurrentRouteMetrics;

    if (supportsEntryType('paint')) {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            captureMetric('FCP', entry.startTime, routeRef.current);
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });
      observers.push(paintObserver);
    }

    if (supportsEntryType('largest-contentful-paint')) {
      const lcpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          largestContentfulPaint = {
            route: routeRef.current,
            value: entry.startTime,
          };
        }
      });
      lcpObserver.observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
      observers.push(lcpObserver);
    }

    if (supportsEntryType('layout-shift')) {
      hasClsSupport = true;
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as LayoutShiftEntry[]) {
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
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObserver);
    }

    if (supportsEntryType('event')) {
      const inpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as EventTimingEntry[]) {
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
            }
          }
        }
      });
      inpObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 40,
      } as PerformanceObserverInit);
      observers.push(inpObserver);
    }

    const reportFinalMetrics = () => {
      if (reportedFinalMetrics) {
        return;
      }

      reportedFinalMetrics = true;
      reportCurrentRouteMetrics();
      reportRouteMetricsRef.current = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportFinalMetrics();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', reportFinalMetrics);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', reportFinalMetrics);
      reportRouteMetricsRef.current = null;
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [posthog]);

  return null;
}
