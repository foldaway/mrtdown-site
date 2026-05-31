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

export function RouteWebVitals() {
  const posthog = usePostHog();
  const route = useRouterState({
    select: (state) => getRouteTelemetryPath(state.location.pathname),
  });
  const routeRef = useRef(route);

  useEffect(() => {
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
      metric: 'CLS' | 'FCP' | 'INP' | 'LCP',
      value: number,
      extraProperties: Record<string, unknown> = {},
    ) => {
      if (!Number.isFinite(value)) {
        return;
      }

      posthog.capture('web_vital', {
        metric,
        value,
        route: routeRef.current,
        pathname: window.location.pathname,
        ...extraProperties,
      });
    };

    const observers: PerformanceObserver[] = [];
    let cumulativeLayoutShift = 0;
    let largestContentfulPaint = 0;
    let maxInteractionDuration = 0;
    let reportedFinalMetrics = false;

    if (supportsEntryType('paint')) {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            captureMetric('FCP', entry.startTime);
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });
      observers.push(paintObserver);
    }

    if (supportsEntryType('largest-contentful-paint')) {
      const lcpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          largestContentfulPaint = entry.startTime;
        }
      });
      lcpObserver.observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
      observers.push(lcpObserver);
    }

    if (supportsEntryType('layout-shift')) {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) {
            cumulativeLayoutShift += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObserver);
    }

    if (supportsEntryType('event')) {
      const inpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as EventTimingEntry[]) {
          if (entry.interactionId != null && entry.interactionId > 0) {
            maxInteractionDuration = Math.max(
              maxInteractionDuration,
              entry.duration,
            );
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
      if (largestContentfulPaint > 0) {
        captureMetric('LCP', largestContentfulPaint);
      }
      captureMetric('CLS', cumulativeLayoutShift);
      if (maxInteractionDuration > 0) {
        captureMetric('INP', maxInteractionDuration);
      }
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
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [posthog]);

  return null;
}
